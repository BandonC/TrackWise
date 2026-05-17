// generate-resume-embedding
//
// Receives { resumeId } from the pg_net trigger, generates a 512-dim
// embedding via Voyage AI (voyage-3-lite) over the resume content,
// and writes it back to the row.
//
// Mirrors generate-embedding: same shared-secret header, same Voyage
// retry/backoff, same fire-and-forget contract. Differs in:
//   - input shape ({ resumeId })
//   - source table (resumes)
//   - text input (just resume.content; no role/company prefix)

import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-lite";
const EMBEDDING_DIM = 512;

const MAX_VOYAGE_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 4000];
const MAX_RETRY_AFTER_MS = 8000;

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

async function callVoyage(
  voyageKey: string,
  text: string,
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
        input: text,
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
    .select("content")
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

  // 4. Call Voyage AI.
  const voyageRes = await callVoyage(voyageKey, text);

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
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = voyageJson.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
    console.error(
      "generate-resume-embedding: unexpected voyage shape",
      voyageJson,
    );
    return new Response("embedding provider error", { status: 502 });
  }

  // 5. Write back.
  const { error: writeErr } = await supabase
    .from("resumes")
    .update({ embedding, embedding_source: text })
    .eq("id", resumeId);

  if (writeErr) {
    console.error("generate-resume-embedding: write failed", writeErr);
    return new Response("write failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
