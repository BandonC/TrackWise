// score-resume-fit
//
// Server-side scoring endpoint called by the dashboard's
// application detail page (Server Component) on cache miss.
// Holds the ANTHROPIC_API_KEY secret so it never reaches the
// browser bundle or the dashboard's .env.
//
// JWT verification is left to the gateway (verify_jwt = true,
// which is the default -- no config.toml override) because
// this endpoint is only called server-to-server from the
// dashboard, which forwards the user's session JWT. There is
// no cross-origin browser caller, so no CORS preflight to
// worry about (unlike score-external-job).
//
// Input: { query, candidates: [{section_label, section_text,
// similarity}] }. The dashboard already has the candidates in
// hand from resume_fit_for_application(); passing them in
// avoids a second DB roundtrip and keeps this function a thin
// wrapper around the shared scoring module.
//
// Output: { similarity, section_label, reasoning, source }.

import { scoreFit, type FitCandidate } from "../_shared/fit-scoring.ts";

const MAX_QUERY_LEN = 5000;
const MAX_CANDIDATES = 10;

type CandidateBody = {
  section_label?: unknown;
  section_text?: unknown;
  similarity?: unknown;
};

type Body = {
  query?: unknown;
  candidates?: unknown;
};

function parseCandidate(
  raw: unknown,
): { ok: true; value: FitCandidate } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "candidate must be an object" };
  }
  const c = raw as CandidateBody;
  if (typeof c.section_label !== "string" || c.section_label.trim() === "") {
    return { ok: false, reason: "candidate.section_label required" };
  }
  if (typeof c.section_text !== "string" || c.section_text.trim() === "") {
    return { ok: false, reason: "candidate.section_text required" };
  }
  if (typeof c.similarity !== "number" || !Number.isFinite(c.similarity)) {
    return { ok: false, reason: "candidate.similarity required" };
  }
  return {
    ok: true,
    value: {
      section_label: c.section_label,
      section_text: c.section_text,
      similarity: c.similarity,
    },
  };
}

function parseBody(
  body: unknown,
):
  | { ok: true; query: string; candidates: FitCandidate[] }
  | { ok: false; reason: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "body must be an object" };
  }
  const b = body as Body;
  if (typeof b.query !== "string" || b.query.trim() === "") {
    return { ok: false, reason: "query required" };
  }
  if (b.query.length > MAX_QUERY_LEN) {
    return { ok: false, reason: "query too long" };
  }
  if (!Array.isArray(b.candidates)) {
    return { ok: false, reason: "candidates must be an array" };
  }
  if (b.candidates.length === 0) {
    return { ok: false, reason: "candidates must be non-empty" };
  }
  if (b.candidates.length > MAX_CANDIDATES) {
    return { ok: false, reason: "too many candidates" };
  }
  const parsed: FitCandidate[] = [];
  for (const raw of b.candidates) {
    const result = parseCandidate(raw);
    if (!result.ok) return result;
    parsed.push(result.value);
  }
  return { ok: true, query: b.query.trim(), candidates: parsed };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  if (!anthropicKey) {
    console.error("score-resume-fit: ANTHROPIC_API_KEY missing");
    return json({ error: "server misconfigured" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const parsed = parseBody(body);
  if (!parsed.ok) return json({ error: parsed.reason }, 400);

  const result = await scoreFit({
    query: parsed.query,
    candidates: parsed.candidates,
    anthropicKey,
    voyageKey,
  });

  if (!result) {
    return json({ error: "score failed" }, 500);
  }

  return json(result, 200);
});
