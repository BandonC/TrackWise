// generate-embedding
//
// Receives { applicationId } from the pg_net trigger, generates a 512-dim
// embedding via Voyage AI (voyage-3-lite), and writes it back to the row.
//
// Authenticated via a shared secret in the x-internal-secret header. The
// pg_net trigger sends this; nothing else should be able to reach the
// function successfully.
//
// Fire-and-forget. Errors are logged server-side; the caller gets a
// generic response.

import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-lite";
const EMBEDDING_DIM = 512;

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
  const applicationId =
    body && typeof body === "object" && "applicationId" in body
      ? (body as Record<string, unknown>).applicationId
      : undefined;
  if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
    return new Response("invalid applicationId", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const voyageKey = Deno.env.get("VOYAGE_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !voyageKey) {
    console.error("generate-embedding: missing env config");
    return new Response("server misconfigured", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 3. Read the row.
  const { data: app, error: readErr } = await supabase
    .from("applications")
    .select("company, role, notes")
    .eq("id", applicationId)
    .maybeSingle();

  if (readErr) {
    console.error("generate-embedding: read failed", readErr);
    return new Response("read failed", { status: 500 });
  }
  if (!app) {
    return new Response("not found", { status: 404 });
  }

  const text = `${app.role} at ${app.company}. ${app.notes ?? ""}`.trim();

  // 4. Call Voyage AI.
  const voyageRes = await fetch(VOYAGE_URL, {
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

  if (!voyageRes.ok) {
    const detail = await voyageRes.text().catch(() => "");
    console.error(
      "generate-embedding: voyage error",
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
      "generate-embedding: unexpected voyage shape",
      voyageJson,
    );
    return new Response("embedding provider error", { status: 502 });
  }

  // 5. Write back.
  const { error: writeErr } = await supabase
    .from("applications")
    .update({ embedding, embedding_source: text })
    .eq("id", applicationId);

  if (writeErr) {
    console.error("generate-embedding: write failed", writeErr);
    return new Response("write failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
