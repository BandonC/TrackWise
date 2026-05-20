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

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";
const EMBEDDING_DIM = 1024;

const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";
const VOYAGE_RERANK_MODEL = "rerank-2.5";
const RERANK_TIMEOUT_MS = 8000;

const MAX_VOYAGE_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 4000];
const MAX_RETRY_AFTER_MS = 8000;

const MAX_FIELD_LEN = 5000;

type Body = {
  role?: unknown;
  company?: unknown;
  notes?: unknown;
};

type ParsedBody = {
  role: string;
  company: string;
  notes: string;
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

// Voyage rerank-2.5 cross-encoder. Given a query and N candidate
// resume chunks, returns the index of the highest-relevance
// candidate and its relevance score. Returns null on any failure
// (timeout, non-2xx, malformed body) so the caller can fall back
// to the top cosine candidate.
async function voyageRerank(
  voyageKey: string,
  query: string,
  documents: string[],
): Promise<{ index: number; relevance_score: number } | null> {
  if (documents.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);
  try {
    const res = await fetch(VOYAGE_RERANK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        documents,
        model: VOYAGE_RERANK_MODEL,
        top_k: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("score-external-job: rerank error", res.status, detail);
      return null;
    }
    // Voyage's rerank response wraps results under `data`, not
    // `results` (their published docs are misleading on this).
    const body = (await res.json()) as {
      data?: Array<{ index?: number; relevance_score?: number }>;
    };
    const top = body.data?.[0];
    if (
      !top ||
      typeof top.index !== "number" ||
      top.index < 0 ||
      top.index >= documents.length ||
      typeof top.relevance_score !== "number"
    ) {
      console.error("score-external-job: unexpected rerank shape", body);
      return null;
    }
    return { index: top.index, relevance_score: top.relevance_score };
  } catch (err) {
    console.error("score-external-job: rerank request failed", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function validateString(
  value: unknown,
  field: string,
  required: boolean,
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
  if (trimmed.length > MAX_FIELD_LEN) {
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
  return {
    ok: true,
    value: {
      role: role.value,
      company: company.value,
      notes: notes.value,
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
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !voyageKey) {
    console.error("score-external-job: missing env config");
    return json({ error: "server misconfigured" }, 500);
  }

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

  const text =
    `${parsed.value.role} at ${parsed.value.company}. ${parsed.value.notes}`.trim();

  // 3. Embed via Voyage.
  const voyageRes = await callVoyage(voyageKey, text);
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

  // Resume side: cosine narrows to top-5 candidates, then
  // rerank-2.5 picks the real winner. If rerank fails for any
  // reason, fall back to the highest-cosine candidate so the
  // overlay still renders.
  const { data: resumeRows, error: resumeErr } = await adminClient
    .rpc("score_external_job_resume", {
      p_user_id: userId,
      p_query: queryLiteral,
      p_top_k: 5,
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
  } | null = null;

  if (candidates.length > 0) {
    const rerankWinner = await voyageRerank(
      voyageKey,
      text,
      candidates.map((c) => c.section_text),
    );
    const winner = rerankWinner
      ? {
          candidate: candidates[rerankWinner.index],
          similarity: rerankWinner.relevance_score,
        }
      : { candidate: candidates[0], similarity: candidates[0].similarity };

    resumeOut = {
      similarity: winner.similarity,
      label: winner.candidate.resume_label,
      section: winner.candidate.section_label,
    };
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
