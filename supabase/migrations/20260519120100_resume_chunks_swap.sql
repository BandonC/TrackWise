-- ============================================================
-- Resume fit -> chunks (PR-C2, second migration)
--
-- Pairs with 20260519120000_resume_chunks.sql. That migration
-- added the resume_chunks table additively. This one switches
-- the two fit RPCs to query chunks and drops the now-dead
-- resumes.embedding column.
--
-- DESTRUCTIVE: drops resumes.embedding. The 1024-dim vectors
-- stored there are no longer the source of truth -- chunks are.
-- The backfill script (--table resumes --all --apply) will
-- re-run generate-resume-embedding for every resume not yet
-- marked 'voyage-3-chunked:*', which populates resume_chunks.
-- During the gap between this migration and the backfill run,
-- fit scores render empty (resume_fit_for_application returns
-- zero rows). Solo-user; acceptable for the rollout window.
--
-- Explicit approval for the destructive part captured in the
-- PR-C2 conversation; per supabase/CLAUDE.md "things to never
-- do" on destructive SQL.
--
-- The two RPCs that ONLY reference applications.embedding
-- (find_similar_applications, score_external_job_history) are
-- untouched -- they don't depend on resumes.embedding.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop the two RPCs that reference resumes.embedding.
--    SQL function bodies create parse-time dependencies on the
--    columns they reference, so the column drop will fail
--    otherwise. Same drop-recreate dance as the voyage-3
--    upgrade migration.
-- ------------------------------------------------------------
drop function if exists public.resume_fit_for_application(uuid);
drop function if exists public.score_external_job_resume(uuid, text);

-- ------------------------------------------------------------
-- 2. Drop the legacy single-vector column. embedding_source
--    stays -- the backfill script uses it as the
--    'voyage-3-chunked:' marker to detect rows still on the
--    pre-chunk pipeline.
-- ------------------------------------------------------------
alter table public.resumes
  drop column embedding;

-- ------------------------------------------------------------
-- 3. resume_fit_for_application -- max-over-chunks.
--
-- Cross-join the target application's embedding against the
-- active resume's chunks; cosine-rank; return the winning row
-- with the section label so the UI can render "matched on:
-- Projects".
--
-- security invoker + pinned search_path. RLS on resumes,
-- resume_chunks, and applications all filter to the caller --
-- a cross-user application_id yields zero rows.
-- ------------------------------------------------------------
create or replace function public.resume_fit_for_application(
  application_id uuid
)
returns table (
  resume_id       uuid,
  resume_label    text,
  similarity      float,
  section_label   text,
  section_ordinal int
)
language sql
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.label,
    (1 - (c.embedding operator(extensions.<=>) a.embedding))::float as similarity,
    c.section_label,
    c.ordinal
  from public.resume_chunks c
  join public.resumes r on r.id = c.resume_id
  cross join (
    select embedding
    from public.applications
    where id = application_id
      and embedding is not null
  ) a
  where r.is_active
    and c.embedding is not null
  order by c.embedding operator(extensions.<=>) a.embedding
  limit 1;
$$;

-- ------------------------------------------------------------
-- 4. score_external_job_resume -- same max-over-chunks pattern
--    for the extension overlay.
--
-- security definer + pinned search_path. Called from the Edge
-- Function service-role context with an explicit p_user_id
-- filter (RLS is bypassed; we re-enforce user scope in the SQL).
-- ------------------------------------------------------------
create or replace function public.score_external_job_resume(
  p_user_id uuid,
  p_query   text
)
returns table (
  resume_label  text,
  similarity    float,
  section_label text
)
language sql
security definer
set search_path = ''
as $$
  select
    r.label,
    (1 - (c.embedding operator(extensions.<=>) p_query::extensions.vector))::float as similarity,
    c.section_label
  from public.resume_chunks c
  join public.resumes r on r.id = c.resume_id
  where r.user_id = p_user_id
    and r.is_active
    and c.embedding is not null
  order by c.embedding operator(extensions.<=>) p_query::extensions.vector
  limit 1;
$$;

-- ------------------------------------------------------------
-- 5. Re-apply the execute revoke for score_external_job_resume.
--    create or replace function does not preserve revokes.
--    Mirrors the pattern in 20260518120000_voyage3_upgrade.sql.
-- ------------------------------------------------------------
revoke execute on function
  public.score_external_job_resume(uuid, text)
from anon, authenticated;
