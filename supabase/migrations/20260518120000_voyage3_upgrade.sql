-- ============================================================
-- Voyage embedding model upgrade: voyage-3-lite (512) -> voyage-3 (1024)
--
-- DESTRUCTIVE: nullifies the embedding column on every row of
-- applications and resumes. The 512-dim vectors are incompatible
-- with the new 1024-dim column type and there is no in-place cast.
-- All embeddings are regenerated out-of-band via
-- scripts/backfill-embeddings.mjs after this migration is pushed.
--
-- During the regen window, fit-score and similar-applications
-- features render empty. Solo-user; acceptable.
--
-- Motivation: voyage-3-lite produced 47% fit score on a strongly
-- matching real resume because averaging across resume sections
-- diluted the signal. voyage-3 has stronger long-document semantic
-- preservation and twice the dimensionality (1024 vs 512).
-- Free-tier headroom unchanged: <500K tokens vs 200M cap.
--
-- See TrackWise.md §10 — the "Embedding dimension locked to 512"
-- entry is amended in this PR.
--
-- This migration was explicitly approved before authoring per
-- supabase/CLAUDE.md "things to never do" rule on destructive SQL.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop the four RPC functions that reference embedding columns.
--    Recreated verbatim at the bottom. Postgres rejects the
--    column type change otherwise: SQL function bodies create
--    parse-time dependencies on the column type.
-- ------------------------------------------------------------
drop function if exists public.find_similar_applications(uuid, int);
drop function if exists public.resume_fit_for_application(uuid);
drop function if exists public.score_external_job_history(uuid, text);
drop function if exists public.score_external_job_resume(uuid, text);

-- ------------------------------------------------------------
-- 2. Change column types. USING null discards the existing
--    vectors -- backfill repopulates them.
-- ------------------------------------------------------------
alter table public.applications
  alter column embedding type extensions.vector(1024) using null;

alter table public.resumes
  alter column embedding type extensions.vector(1024) using null;

-- ------------------------------------------------------------
-- 3. Recreate the RPCs. Bodies are byte-identical to the prior
--    migrations -- none of them hardcoded the dim.
--    Sources:
--      find_similar_applications        -> 20260514150000_semantic_search.sql
--      resume_fit_for_application       -> 20260516132000_resume_fit_rpc.sql
--      score_external_job_*             -> 20260517120000_score_external_job_rpcs.sql
-- ------------------------------------------------------------

create or replace function public.find_similar_applications(
  target_id   uuid,
  match_count int default 5
)
returns table (
  id         uuid,
  company    text,
  role       text,
  similarity float
)
language sql
security invoker
set search_path = ''
as $$
  select
    a.id,
    a.company,
    a.role,
    (1 - (a.embedding operator(extensions.<=>) target.embedding))::float as similarity
  from public.applications a
  cross join (
    select embedding
    from public.applications
    where id = target_id
      and user_id = auth.uid()
      and embedding is not null
  ) target
  where a.id != target_id
    and a.user_id = auth.uid()
    and a.embedding is not null
  order by a.embedding operator(extensions.<=>) target.embedding
  limit match_count;
$$;

create or replace function public.resume_fit_for_application(
  application_id uuid
)
returns table (
  resume_id    uuid,
  resume_label text,
  similarity   float
)
language sql
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.label,
    (1 - (r.embedding operator(extensions.<=>) a.embedding))::float as similarity
  from public.resumes r
  cross join (
    select embedding
    from public.applications
    where id = application_id
      and embedding is not null
  ) a
  where r.embedding is not null
    and r.is_active
  order by r.embedding operator(extensions.<=>) a.embedding
  limit 1;
$$;

create or replace function public.score_external_job_history(
  p_user_id uuid,
  p_query   text
)
returns table (
  application_id uuid,
  company        text,
  role           text,
  similarity     float
)
language sql
security definer
set search_path = ''
as $$
  select
    a.id,
    a.company,
    a.role,
    (1 - (a.embedding operator(extensions.<=>) p_query::extensions.vector))::float
      as similarity
  from public.applications a
  where a.user_id = p_user_id
    and a.embedding is not null
  order by a.embedding operator(extensions.<=>) p_query::extensions.vector
  limit 1;
$$;

create or replace function public.score_external_job_resume(
  p_user_id uuid,
  p_query   text
)
returns table (
  resume_label text,
  similarity   float
)
language sql
security definer
set search_path = ''
as $$
  select
    r.label,
    (1 - (r.embedding operator(extensions.<=>) p_query::extensions.vector))::float
      as similarity
  from public.resumes r
  where r.user_id = p_user_id
    and r.is_active
    and r.embedding is not null
  limit 1;
$$;

-- ------------------------------------------------------------
-- 4. Re-apply the execute revokes from the prior migrations.
--    create or replace function does not preserve revokes.
-- ------------------------------------------------------------
revoke execute on function
  public.score_external_job_history(uuid, text),
  public.score_external_job_resume(uuid, text)
from anon, authenticated;
