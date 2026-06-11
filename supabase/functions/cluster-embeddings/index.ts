// cluster-embeddings
//
// Recomputes the user's application clusters from their embedded
// applications. Invoked on-demand from the dashboard server action;
// not from a trigger.
//
// Authenticated as the calling user: deployed with verify_jwt (the
// platform gateway checks the JWT signature), and the user id is
// resolved from the token via auth.getUser() — never from the body,
// so a caller can only recompute their own clusters.
//
// Flow:
//   1. Resolve the calling user from the Authorization JWT.
//   2. Fetch (id, company, embedding) for the user's embedded rows.
//   3. If fewer than MIN_ROWS_FOR_CLUSTERING, wipe clusters and return.
//   4. Run K-means (k = suggestK(n)).
//   5. Delete user's existing clusters (cascades cluster_id → null).
//   6. Insert new clusters, then update each application's cluster_id.
//
// Failure modes are non-catastrophic: a crash mid-recompute leaves the
// user with cluster_id = null on every row, which the analytics card
// renders as "Not enough data". The next recompute restores it.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { kmeans, suggestK } from "./kmeans.ts";

const MIN_ROWS_FOR_CLUSTERING = 4;
const TOP_COMPANIES_IN_LABEL = 3;

type Row = {
  id: string;
  company: string;
  embedding: number[] | string | null;
};

// Voyage stores embeddings as a vector — Supabase returns them as either
// number[] or a string like "[0.1,0.2,...]" depending on the client
// version. Normalize to number[] here.
function parseEmbedding(raw: number[] | string | null): number[] | null {
  if (raw === null) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function buildLabel(companies: string[]): string {
  const counts = new Map<string, number>();
  for (const c of companies) counts.set(c, (counts.get(c) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, TOP_COMPANIES_IN_LABEL).map((e) => e[0]);
  const remaining = sorted.length - top.length;
  const base = top.join(", ");
  return remaining > 0 ? `${base} +${remaining} more` : base;
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("cluster-embeddings: missing env config");
    return new Response("server misconfigured", { status: 500 });
  }

  // 1. Resolve the calling user from the JWT. The gateway has already
  //    verified the signature; getUser() maps the token to a real user
  //    and rejects anon/service tokens.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response("unauthorized", { status: 401 });
  }
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user) {
    return new Response("unauthorized", { status: 401 });
  }
  const userId = userData.user.id;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 2. Fetch embedded rows.
  const { data: rows, error: readErr } = await supabase
    .from("applications")
    .select("id, company, embedding")
    .eq("user_id", userId)
    .not("embedding", "is", null);

  if (readErr) {
    console.error("cluster-embeddings: read failed", readErr);
    return new Response("read failed", { status: 500 });
  }

  const embedded: { id: string; company: string; vector: number[] }[] = [];
  for (const r of (rows ?? []) as Row[]) {
    const v = parseEmbedding(r.embedding);
    if (v && v.length > 0) embedded.push({ id: r.id, company: r.company, vector: v });
  }

  // Always wipe stale clusters first so the user's state reflects the
  // most recent recompute attempt, even if there isn't enough data now.
  const { error: deleteErr } = await supabase
    .from("clusters")
    .delete()
    .eq("user_id", userId);
  if (deleteErr) {
    console.error("cluster-embeddings: delete failed", deleteErr);
    return new Response("delete failed", { status: 500 });
  }

  if (embedded.length < MIN_ROWS_FOR_CLUSTERING) {
    return new Response(
      JSON.stringify({ status: "skipped", reason: "not_enough_data", n: embedded.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // 3. Cluster.
  const k = suggestK(embedded.length);
  const { assignments } = kmeans(embedded.map((e) => e.vector), k);

  // Group ids + companies per cluster index.
  const byCluster = new Map<number, { ids: string[]; companies: string[] }>();
  for (let i = 0; i < embedded.length; i++) {
    const c = assignments[i];
    const bucket = byCluster.get(c) ?? { ids: [], companies: [] };
    bucket.ids.push(embedded[i].id);
    bucket.companies.push(embedded[i].company);
    byCluster.set(c, bucket);
  }

  // 4. Insert new cluster rows.
  const inserts = [...byCluster.values()].map((b) => ({
    user_id: userId,
    label: buildLabel(b.companies),
    size: b.ids.length,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("clusters")
    .insert(inserts)
    .select("id");
  if (insertErr || !inserted) {
    console.error("cluster-embeddings: insert failed", insertErr);
    return new Response("insert failed", { status: 500 });
  }

  // 5. Update each application's cluster_id.
  const buckets = [...byCluster.values()];
  for (let i = 0; i < buckets.length; i++) {
    const clusterId = inserted[i].id;
    const { error: updateErr } = await supabase
      .from("applications")
      .update({ cluster_id: clusterId })
      .in("id", buckets[i].ids);
    if (updateErr) {
      console.error("cluster-embeddings: update failed", updateErr);
      return new Response("update failed", { status: 500 });
    }
  }

  return new Response(
    JSON.stringify({
      status: "ok",
      clusters: inserted.length,
      assigned: embedded.length,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
