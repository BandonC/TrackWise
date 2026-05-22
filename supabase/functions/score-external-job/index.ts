// score-external-job
//
// User-facing Edge Function. Called from the Chrome extension's service
// worker when the user clicks "Check fit" on a LinkedIn or Indeed job
// page.
//
// Deployed with JWT verification DISABLED at the gateway
// (verify_jwt = false in supabase/config.toml) so the browser's CORS
// preflight can reach our OPTIONS handler. We verify the JWT manually
// in the body of every non-OPTIONS request — same security guarantee,
// CORS works. See supabase/GOTCHAS.md.
//
// Flow:
//   1. Verify caller's JWT via supabase.auth.getUser(token).
//   2. Validate body { role, company, notes? }.
//   3. Embed the query text via Voyage (input_type: "query").
//   4. Service-role query: cosine similarity vs the caller's
//      applications and their active resume.
//   5. Return scalars — never the embedding itself.
//
// Embeddings never leave the server. The client only ever sees scores
// and a matched_application id.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { scoreFit } from "../_shared/fit-scoring.ts";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";
const EMBEDDING_DIM = 1024;

const MAX_VOYAGE_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 4000];
const MAX_RETRY_AFTER_MS = 8000;

const MAX_FIELD_LEN = 5000;
// Two JD caps. The embedding source gets up to 8KB (matches the
// dashboard's generate-embedding cap -- richer Voyage signal pre-
// filter). The Haiku query gets up to 4KB (matches the dashboard's
// detail page) so overlay and detail scores judge against the same
// amount of JD context.
const MAX_JD_LEN_EMBED = 8000;
const MAX_JD_LEN_HAIKU = 4000;

type Body = {
  role?: unknown;
  company?: unknown;
  notes?: unknown;
  job_description?: unknown;
};

type ParsedBody = {
  role: string;
  company: string;
  notes: string;
  job_description: string;
};

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
        input_type: "query",
      }),
    });

    if (res.ok) return res;

    const transient = res.status === 429 || res.status >= 500;
    const isLast = attempt === MAX_VOYAGE_ATTEMPTS - 1;
    if (!transient || isLast) return res;

    const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
    const waitMs = retryAfter ?? BACKOFF_MS[attempt] ?? 4000;
    console.error(
      `score-external-job: voyage ${res.status}, retry ${attempt + 1}/${MAX_VOYAGE_ATTEMPTS - 1} in ${waitMs}ms`,
    );
    await res.text().catch(() => "");
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRes = res;
  }
  return lastRes!;
}

function validateString(
  value: unknown,
  field: string,
  required: boolean,
  maxLen: number = MAX_FIELD_LEN,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (value === undefined || value === null || value === "") {
    if (required) return { ok: false, reason: `${field} required` };
    return { ok: true, value: "" };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: `${field} must be a string` };
  }
  const trimmed = value.trim();
  if (required && trimmed === "") {
    return { ok: false, reason: `${field} required` };
  }
  if (trimmed.length > maxLen) {
    return { ok: false, reason: `${field} too long` };
  }
  return { ok: true, value: trimmed };
}

function parseBody(
  body: unknown,
): { ok: true; value: ParsedBody } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "body must be an object" };
  }
  const b = body as Body;
  const role = validateString(b.role, "role", true);
  if (!role.ok) return role;
  const company = validateString(b.company, "company", true);
  if (!company.ok) return company;
  const notes = validateString(b.notes, "notes", false);
  if (!notes.ok) return notes;
  const jd = validateString(
    b.job_description,
    "job_description",
    false,
    MAX_JD_LEN_EMBED,
  );
  if (!jd.ok) return jd;
  return {
    ok: true,
    value: {
      role: role.value,
      company: company.value,
      notes: notes.value,
      job_description: jd.value,
    },
  };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // 0. CORS preflight — browsers send OPTIONS before cross-origin POSTs.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  // 1. Auth — extract bearer token, verify via Supabase.
  const authHeader = req.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "missing bearer token" }, 401);
  const accessToken = match[1];

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !voyageKey) {
    console.error("score-external-job: missing env config");
    return json({ error: "server misconfigured" }, 500);
  }
  // ANTHROPIC_API_KEY is recommended but not required -- if absent
  // the shared scoreFit will fall back to rerank then cosine.

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userErr } = await authClient.auth.getUser(
    accessToken,
  );
  if (userErr || !userData.user) {
    return json({ error: "invalid session" }, 401);
  }
  const userId = userData.user.id;

  // 2. Parse + validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const parsed = parseBody(body);
  if (!parsed.ok) return json({ error: parsed.reason }, 400);

  // 2b. Rate limit before any LLM/embedding work. Per-minute and
  // per-day quotas keep a misbehaving account bounded to a finite
  // Anthropic spend. Maps the RPC's P0001 exception to a 429.
  const adminClientForRateLimit = createClient(supabaseUrl, serviceRoleKey);
  const { error: rlErr } = await adminClientForRateLimit.rpc(
    "check_fit_score_rate_limit",
    { p_user_id: userId },
  );
  if (rlErr) {
    if (rlErr.message?.includes("rate_limit_per_minute")) {
      return json({ error: "rate_limit_per_minute" }, 429);
    }
    if (rlErr.message?.includes("rate_limit_per_day")) {
      return json({ error: "rate_limit_per_day" }, 429);
    }
    console.error("score-external-job: rate limit rpc failed", rlErr);
    return json({ error: "rate limit check failed" }, 500);
  }

  // Compose the scoring texts. JD goes through two different caps:
  // 8KB into the embedding source (matches generate-embedding), 4KB
  // into the Haiku query (matches the dashboard detail page). Same
  // input shape across both surfaces means overlay and detail scores
  // are directly comparable.
  const head = `${parsed.value.role} at ${parsed.value.company}. ${parsed.value.notes}`;
  const jdEmbed = parsed.value.job_description.slice(0, MAX_JD_LEN_EMBED);
  const jdHaiku = parsed.value.job_description.slice(0, MAX_JD_LEN_HAIKU);
  const embedText = `${head}\n\n${jdEmbed}`.trim();
  const haikuQuery = `${head}\n\n${jdHaiku}`.trim();

  // 3. Embed via Voyage.
  const voyageRes = await callVoyage(voyageKey, embedText);
  if (!voyageRes.ok) {
    const detail = await voyageRes.text().catch(() => "");
    console.error(
      "score-external-job: voyage error",
      voyageRes.status,
      detail,
    );
    return json({ error: "embedding provider error" }, 502);
  }

  const voyageJson = (await voyageRes.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const queryEmbedding = voyageJson.data?.[0]?.embedding;
  if (
    !Array.isArray(queryEmbedding) ||
    queryEmbedding.length !== EMBEDDING_DIM
  ) {
    console.error(
      "score-external-job: unexpected voyage shape",
      voyageJson,
    );
    return json({ error: "embedding provider error" }, 502);
  }

  // 4. Score server-side. Service-role client + explicit user_id filter.
  // pgvector wants the embedding rendered as a Postgres vector literal,
  // which JSON.stringify happens to produce for a number[].
  const queryLiteral = JSON.stringify(queryEmbedding);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: historyRow, error: historyErr } = await adminClient
    .rpc("score_external_job_history", {
      p_user_id: userId,
      p_query: queryLiteral,
    })
    .maybeSingle();

  if (historyErr) {
    console.error("score-external-job: history rpc failed", historyErr);
    return json({ error: "score failed" }, 500);
  }

  // Resume side: cosine narrows to top-5 candidates, then the
  // shared scoreFit module runs Haiku -> rerank -> cosine
  // fallback. Same scoring algorithm as the dashboard detail
  // page so the overlay and detail-page numbers are comparable.
  const { data: resumeRows, error: resumeErr } = await adminClient
    .rpc("score_external_job_resume", {
      p_user_id: userId,
      p_query: queryLiteral,
      p_top_k: 10,
    });

  if (resumeErr) {
    console.error("score-external-job: resume rpc failed", resumeErr);
    return json({ error: "score failed" }, 500);
  }

  type ResumeCandidate = {
    resume_label: string;
    similarity: number;
    section_label: string;
    section_text: string;
  };
  const candidates = (resumeRows ?? []) as ResumeCandidate[];

  let resumeOut: {
    similarity: number;
    label: string;
    section: string;
    reasoning: string | null;
  } | null = null;

  if (candidates.length > 0) {
    const scored = await scoreFit({
      query: haikuQuery,
      candidates: candidates.map((c) => ({
        section_label: c.section_label,
        section_text: c.section_text,
        similarity: c.similarity,
      })),
      anthropicKey,
      voyageKey,
    });

    if (scored) {
      // resume_label isn't returned by scoreFit (single resume per
      // user in v1; the label maps 1:1 to the active resume). Pull
      // it from the matching candidate -- all candidates share the
      // same resume_label in the v1 single-resume model.
      const label = candidates[0].resume_label;
      resumeOut = {
        similarity: scored.similarity,
        label,
        section: scored.section_label,
        reasoning: scored.reasoning,
      };
    }
  }

  return json(
    {
      history: historyRow
        ? {
            similarity: historyRow.similarity,
            matched_application: {
              id: historyRow.application_id,
              role: historyRow.role,
              company: historyRow.company,
            },
          }
        : null,
      resume: resumeOut,
    },
    200,
  );
});
