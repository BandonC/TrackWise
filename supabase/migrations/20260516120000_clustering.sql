-- ============================================================
-- Clustering schema
--
-- Adds:
--   1. clusters table: one row per cluster per user, written by the
--      cluster-embeddings Edge Function on recompute.
--   2. applications.cluster_id FK back to clusters (nullable; null for
--      rows whose embedding hasn't landed yet, or before first compute).
--   3. v_response_rate_by_cluster view for the analytics page.
--   4. RLS + explicit grants matching the day-6 grants migration.
--
-- The cluster_id on applications is written by the Edge Function under
-- the service_role and never by the dashboard client. The dashboard
-- exposes no UI to edit cluster_id directly. A user could in principle
-- UPDATE their own application row's cluster_id (RLS allows it because
-- it's their row), but the FK would only resolve to clusters they can
-- see via RLS — i.e. their own. No cross-user contamination is possible
-- from the client.
--
-- Note: there is no DB-level CHECK that clusters.user_id matches
-- applications.user_id for a given cluster_id. The recompute logic
-- enforces this; defense-in-depth via trigger is deliberately deferred
-- as RLS already prevents cross-user discovery of cluster IDs.
-- ============================================================

-- ------------------------------------------------------------
-- clusters table
-- ------------------------------------------------------------
create table clusters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  size        int  not null,
  computed_at timestamptz not null default now()
);

create index clusters_user_computed_at_idx
  on clusters (user_id, computed_at desc);

alter table clusters enable row level security;

create policy "users access own clusters"
  on clusters for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- applications.cluster_id
-- on delete set null: deleting a cluster (recompute clears + reinserts)
-- leaves applications pointing at null until they're reassigned by the
-- same recompute transaction.
-- ------------------------------------------------------------
alter table applications
  add column cluster_id uuid references clusters(id) on delete set null;

create index applications_cluster_id_idx
  on applications (cluster_id)
  where cluster_id is not null;

-- ------------------------------------------------------------
-- v_response_rate_by_cluster
-- One row per cluster. Aggregation lives in the view (unlike
-- v_response_rate) because date-range filtering doesn't apply at the
-- cluster level — clusters are global to the user's history.
-- ------------------------------------------------------------
create view v_response_rate_by_cluster
with (security_invoker = on) as
select
  c.id          as cluster_id,
  c.user_id,
  c.label,
  c.computed_at,
  count(a.id)                                            as total,
  count(a.id) filter (where a.status <> 'applied')       as responded,
  count(a.id) filter (where a.status <> 'applied')::float
    / nullif(count(a.id), 0)                             as rate
from clusters c
left join applications a on a.cluster_id = c.id
group by c.id, c.user_id, c.label, c.computed_at;

-- ------------------------------------------------------------
-- Grants (matching the day-6 explicit-grants pattern)
-- anon: nothing. authenticated: SELECT only (no client writes).
-- service_role: full access for the Edge Function.
-- ------------------------------------------------------------
revoke all on table public.clusters                    from anon;
revoke all on table public.v_response_rate_by_cluster  from anon;

grant select on public.clusters                    to authenticated;
grant select on public.v_response_rate_by_cluster  to authenticated;

grant all    on public.clusters                    to service_role;
grant select on public.v_response_rate_by_cluster  to service_role;
