// generate-resume-embedding
//
// Receives { resumeId } from the pg_net trigger, splits the resume
// content into section-level chunks, generates a 1024-dim embedding
// per chunk via Voyage AI (voyage-3) in a single batched call, and
// writes the chunks to the resume_chunks table.
//
// Why chunks: a single resume vector is an average across all
// sections, which dilutes the signal against any concrete job
// posting. Per-section chunks plus max-pool on the read side give
// the model a direct comparison between the matching part of the
// resume and the job. See TrackWise.md s10 (PR-C2 decision).
//
// Splitter is multi-tier (degrades gracefully):
//   1. Detect section headers (ALL-CAPS, markdown, or Title:)
//      and split. Inside Projects/Experience, sub-split items on
//      blank lines.
//   2. If no headers, split the whole text on double blank lines.
//   3. If still nothing, single "full" chunk (same as pre-PR-C2).
//
// One Voyage call per save regardless of chunk count -- Voyage
// accepts an array for `input` and returns one vector per item.
//
// resumes.embedding stays null after this PR. embedding_source on
// the parent resume row gets the marker 'voyage-3-chunked:<text>'
// so scripts/backfill-embeddings.mjs --all can detect rows still
// on the old single-vector pipeline.

import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";
const EMBEDDING_DIM = 1024;

const MAX_VOYAGE_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 4000];
const MAX_RETRY_AFTER_MS = 8000;

// Sanity caps. A resume with more chunks than this is almost
// certainly malformed input (or a paste of a whole portfolio).
// Per-chunk text cap keeps Voyage payloads small; voyage-3 accepts
// up to 32k tokens per item but resume sections rarely exceed a
// few hundred words.
const MAX_CHUNKS = 40;
const MAX_CHUNK_CHARS = 4000;

// ------------------------------------------------------------
// Section detection
//
// Keyword -> canonical label. The lookup is case-insensitive and
// matches if the header line contains any of these tokens. Order
// matters: more specific keywords first so "work experience"
// resolves to EXPERIENCE rather than landing in OTHER.
// ------------------------------------------------------------
const SECTION_KEYWORDS: Array<[RegExp, string]> = [
  [/\bwork\s+experience\b|\bemployment\b|\bexperience\b/i, "EXPERIENCE"],
  [/\bprojects?\b|\bportfolio\b/i, "PROJECTS"],
  [/\btechnical\s+skills?\b|\bskills?\b|\bcompetencies\b/i, "SKILLS"],
  [/\beducation\b|\bacademic\b/i, "EDUCATION"],
  [/\bcertifications?\b|\bawards?\b|\bhonors?\b/i, "CERTIFICATIONS"],
  [/\bsummary\b|\bprofile\b|\bobjective\b|\babout\b/i, "SUMMARY"],
];

// Sections whose content is a list of items separated by blank
// lines. Each item becomes its own chunk -- one per project, one
// per role. Other sections stay as a single chunk.
const ITEMIZED = new Set(["PROJECTS", "EXPERIENCE"]);

type RawHeader = { line: number; label: string; raw: string };
type RawSection = { label: string; raw: string; text: string };
type Chunk = { label: string; text: string };

function classifyHeader(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return null;

  // Markdown header: # PROJECTS, ## Experience, etc.
  const md = trimmed.match(/^#{1,3}\s+(.+?)\s*$/);
  if (md) return labelFor(md[1]);

  // ALL-CAPS line, mostly letters/spaces, no trailing punctuation
  // other than ':'.
  const stripped = trimmed.replace(/:$/, "");
  if (
    stripped.length >= 3 &&
    /^[A-Z][A-Z\s&/\-]+$/.test(stripped) &&
    !/\d/.test(stripped)
  ) {
    return labelFor(stripped);
  }

  // Title-case line ending with ':'  e.g.  "Work Experience:"
  if (/^[A-Z][a-zA-Z\s&/\-]{2,}:$/.test(trimmed)) {
    return labelFor(trimmed.replace(/:$/, ""));
  }

  return null;
}

function labelFor(raw: string): string {
  for (const [pattern, canonical] of SECTION_KEYWORDS) {
    if (pattern.test(raw)) return canonical;
  }
  // Unrecognised header -- preserve the user's wording, trimmed.
  return `OTHER:${raw.trim()}`;
}

function splitSections(content: string): RawSection[] {
  const lines = content.split(/\r?\n/);
  const headers: RawHeader[] = [];
  for (let i = 0; i < lines.length; i++) {
    const label = classifyHeader(lines[i]);
    if (label) headers.push({ line: i, label, raw: lines[i] });
  }

  if (headers.length === 0) return [];

  const sections: RawSection[] = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].line + 1;
    const end = i + 1 < headers.length ? headers[i + 1].line : lines.length;
    const text = lines.slice(start, end).join("\n").trim();
    if (text.length === 0) continue;
    sections.push({ label: headers[i].label, raw: headers[i].raw, text });
  }
  return sections;
}

// Stragglers commonly seen as their own block after a blank line
// inside a single project / role entry. Folded back into the
// preceding chunk by the merge pass below.
const CONTINUATION_PREFIX =
  /^(?:tech\s*stack|stack|tools?|technologies|frameworks?|languages?)\s*[:\-]/i;
const CONTINUATION_LINE = /^[\s\-\*•◦]/;
const MERGE_BELOW_CHARS = 100;

function shouldMerge(text: string): boolean {
  // Fold back into the previous entry if this block is:
  //   - short (likely a sub-line like a company name)
  //   - or starts like a continuation (Tech Stack:, bullet, indent)
  //   - or its first line is too long / ends in punctuation to be
  //     a typical entry header (titles are short, no trailing
  //     period). This catches the case where an entry's
  //     responsibilities paragraph is separated from its title
  //     by a blank line, which would otherwise become its own
  //     chunk and hurt scoring (the title-only stub becomes a
  //     low-specificity "winner" against unrelated jobs).
  if (text.length < MERGE_BELOW_CHARS) return true;
  const firstLine = text.split("\n", 1)[0];
  if (CONTINUATION_PREFIX.test(firstLine)) return true;
  if (CONTINUATION_LINE.test(firstLine)) return true;
  if (firstLine.length > 60) return true;
  if (/[.!?]$/.test(firstLine.trim())) return true;
  return false;
}

function itemize(section: RawSection): Chunk[] {
  // Split on one or more blank lines. Each non-empty block is a
  // candidate item; the merge pass below folds short or
  // continuation-shaped blocks back into the previous item so
  // that "Tech Stack: ..." or a stray title line doesn't get its
  // own embedding.
  const candidates = section.text
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (candidates.length <= 1) {
    return [{ label: section.label, text: section.text }];
  }

  const merged: string[] = [];
  for (const block of candidates) {
    if (merged.length > 0 && shouldMerge(block)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n\n${block}`;
    } else {
      merged.push(block);
    }
  }

  if (merged.length <= 1) {
    return [{ label: section.label, text: section.text }];
  }

  return merged.map((text, idx) => {
    // First non-empty line of the (possibly merged) item becomes
    // the chunk's human-facing tail: "EXPERIENCE - Acme Corp".
    const firstLine = text.split("\n")[0].trim().slice(0, 80);
    const tail = firstLine.length > 0 ? firstLine : `item ${idx + 1}`;
    return { label: `${section.label} - ${tail}`, text };
  });
}

function chunk(content: string): Chunk[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  // Tier 1: header-based split.
  const sections = splitSections(trimmed);
  if (sections.length > 0) {
    const out: Chunk[] = [];
    for (const s of sections) {
      if (ITEMIZED.has(s.label)) {
        out.push(...itemize(s));
      } else {
        out.push({ label: s.label, text: s.text });
      }
    }
    if (out.length > 0) return capChunks(out);
  }

  // Tier 2: split on double blank lines.
  const blocks = trimmed
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (blocks.length > 1) {
    return capChunks(
      blocks.map((text, idx) => ({ label: `block ${idx + 1}`, text })),
    );
  }

  // Tier 3: single chunk.
  return capChunks([{ label: "full", text: trimmed }]);
}

function capChunks(chunks: Chunk[]): Chunk[] {
  return chunks.slice(0, MAX_CHUNKS).map((c) => ({
    label: c.label,
    text: c.text.length > MAX_CHUNK_CHARS
      ? c.text.slice(0, MAX_CHUNK_CHARS)
      : c.text,
  }));
}

// ------------------------------------------------------------
// Voyage batch call
// ------------------------------------------------------------
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return null;
}

async function callVoyageBatch(
  voyageKey: string,
  inputs: string[],
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < MAX_VOYAGE_ATTEMPTS; attempt++) {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: inputs,
        model: VOYAGE_MODEL,
        input_type: "document",
      }),
    });

    if (res.ok) return res;

    const transient = res.status === 429 || res.status >= 500;
    const isLast = attempt === MAX_VOYAGE_ATTEMPTS - 1;
    if (!transient || isLast) return res;

    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    const waitMs = retryAfter ?? BACKOFF_MS[attempt] ?? 4000;
    console.error(
      `generate-resume-embedding: voyage ${res.status}, retry ${attempt + 1}/${MAX_VOYAGE_ATTEMPTS - 1} in ${waitMs}ms`,
    );
    await res.text().catch(() => "");
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRes = res;
  }
  return lastRes!;
}

Deno.serve(async (req) => {
  // 1. Verify shared secret.
  const expected = Deno.env.get("EDGE_FUNCTION_SECRET");
  const provided = req.headers.get("x-internal-secret");
  if (!expected || provided !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  // 2. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const resumeId =
    body && typeof body === "object" && "resumeId" in body
      ? (body as Record<string, unknown>).resumeId
      : undefined;
  if (typeof resumeId !== "string" || !UUID_RE.test(resumeId)) {
    return new Response("invalid resumeId", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !voyageKey) {
    console.error("generate-resume-embedding: missing env config");
    return new Response("server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 3. Read the row.
  const { data: resume, error: readErr } = await supabase
    .from("resumes")
    .select("user_id, content")
    .eq("id", resumeId)
    .maybeSingle();

  if (readErr) {
    console.error("generate-resume-embedding: read failed", readErr);
    return new Response("read failed", { status: 500 });
  }
  if (!resume) {
    return new Response("not found", { status: 404 });
  }

  const text = resume.content.trim();
  if (!text) {
    return new Response("empty content", { status: 400 });
  }

  // 4. Chunk.
  const chunks = chunk(text);
  if (chunks.length === 0) {
    return new Response("empty content", { status: 400 });
  }

  // 5. Batch embed.
  const voyageRes = await callVoyageBatch(
    voyageKey,
    chunks.map((c) => c.text),
  );

  if (!voyageRes.ok) {
    const detail = await voyageRes.text().catch(() => "");
    console.error(
      "generate-resume-embedding: voyage error",
      voyageRes.status,
      detail,
    );
    return new Response("embedding provider error", { status: 502 });
  }

  const voyageJson = (await voyageRes.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const data = voyageJson.data;
  if (!Array.isArray(data) || data.length !== chunks.length) {
    console.error(
      "generate-resume-embedding: unexpected voyage shape",
      voyageJson,
    );
    return new Response("embedding provider error", { status: 502 });
  }

  // Map by `index` to be safe (Voyage docs say order is preserved
  // but we don't rely on it).
  const embeddings: number[][] = new Array(chunks.length);
  for (const item of data) {
    const idx = typeof item.index === "number" ? item.index : -1;
    if (
      idx < 0 ||
      idx >= chunks.length ||
      !Array.isArray(item.embedding) ||
      item.embedding.length !== EMBEDDING_DIM
    ) {
      console.error(
        "generate-resume-embedding: bad voyage row",
        idx,
        item.embedding?.length,
      );
      return new Response("embedding provider error", { status: 502 });
    }
    embeddings[idx] = item.embedding;
  }
  if (embeddings.some((e) => !e)) {
    console.error("generate-resume-embedding: missing embedding in batch");
    return new Response("embedding provider error", { status: 502 });
  }

  // 6. Write chunks. Delete prior chunks for this resume, then
  // bulk insert the new set. Two statements; not atomic across
  // PostgREST calls, but the window is small and the trigger
  // re-fires on next content update if anything fails midway.
  const { error: delErr } = await supabase
    .from("resume_chunks")
    .delete()
    .eq("resume_id", resumeId);
  if (delErr) {
    console.error("generate-resume-embedding: delete failed", delErr);
    return new Response("write failed", { status: 500 });
  }

  const rows = chunks.map((c, i) => ({
    resume_id: resumeId,
    user_id: resume.user_id,
    section_label: c.label,
    section_text: c.text,
    ordinal: i,
    embedding: embeddings[i],
    embedding_source: `voyage-3-chunked:${c.text}`,
  }));

  const { error: insErr } = await supabase
    .from("resume_chunks")
    .insert(rows);
  if (insErr) {
    console.error("generate-resume-embedding: insert failed", insErr);
    return new Response("write failed", { status: 500 });
  }

  // 7. Mark parent. The marker lets the backfill script (--all
  // mode) detect resumes still on the pre-chunk pipeline. The
  // resumes.embedding column was dropped in
  // 20260519120100_resume_chunks_swap.sql -- chunks are the
  // source of truth now -- so we only touch embedding_source.
  const { error: markErr } = await supabase
    .from("resumes")
    .update({
      embedding_source: `voyage-3-chunked:${text}`,
    })
    .eq("id", resumeId);
  if (markErr) {
    console.error("generate-resume-embedding: mark failed", markErr);
    return new Response("write failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
