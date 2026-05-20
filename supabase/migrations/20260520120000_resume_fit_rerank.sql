-- ============================================================
-- Resume fit -> rerank-2.5 (PR-C2, third migration)
--
-- Two structural changes:
--
-- 1. Both fit RPCs return top-K candidate chunks (with text)
--    instead of a single best-cosine row. The consumer
--    (dashboard server component, score-external-job Edge
--    Function) sends the K candidates plus the job text to
--    Voyage's rerank-2.5 cross-encoder model, which produces a
--    relevance score that meaningfully exceeds cosine over
--    independent embeddings -- especially for cases where the
--    matching content is conceptually related but doesn't share
--    surface vocabulary.
--
--    K defaults to 5. Solo-user free-tier headroom on Voyage is
--    not a concern at this scale.
--
-- 2. Applications get three cache columns + a row-local
--    invalidation trigger so the dashboard's per-page rerank
--    call runs once per (application, resume-content-version)
--    pair. Cache freshness is checked LAZILY at read time:
--    `applications.resume_fit_computed_at >= max(chunk.created_at)
--    on the active resume` means cache valid. This avoids any
--    resume-side "sweep" trigger and scales to arbitrary
--    application counts.
--
-- See TrackWise.md s10 (PR-C2 decision log, to be amended in
-- the docs step).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cache columns on applications.
--    resume_fit_section_label is the section_label from the
--    winning chunk after rerank (UI displays it).
--    resume_fit_computed_at gates the lazy-staleness check.
-- ------------------------------------------------------------
alter table public.applications
  add column resume_fit_similarity   float,
  add column resume_fit_section_label text,
  add column resume_fit_computed_at  timestamptz;

-- ------------------------------------------------------------
-- 2. Row-local invalidation: when an application's embedding
--    regenerates (notes/role/company edit), its fit cache is
--    no longer correct. Clear it before the new row lands so
--    the next page load triggers a recompute.
--
--    This trigger is BEFORE UPDATE OF embedding -- it only
--    fires when the embedding column itself changes. The
--    generate-embedding Edge Function does an UPDATE with both
--    embedding and embedding_source columns, so this fires on
--    that path. Editing other fields (status, applied_at, etc.)
--    leaves the cache alone.
-- ------------------------------------------------------------
create or replace function public.invalidate_application_fit_cache()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.resume_fit_similarity := null;
  new.resume_fit_section_label := null;
  new.resume_fit_computed_at := null;
  return new;
end;
$$;

create trigger on_application_embedding_change_invalidate_fit
  before update of embedding on public.applications
  for each row execute function public.invalidate_application_fit_cache();

revoke execute on function public.invalidate_application_fit_cache()
  from anon, authenticated;

-- ------------------------------------------------------------
-- 3. resume_fit_for_application -- top-K candidates.
--    section_text is included so the consumer can pass each
--    candidate to Voyage rerank. similarity is the raw cosine
--    similarity, kept for diagnostics and as the rerank
--    fallback if Voyage is unreachable.
--
--    Adds defaulted top_k parameter so existing single-arg
--    callers continue to compile, but the dashboard will pass
--    5 explicitly.
-- ------------------------------------------------------------
drop function if exists public.resume_fit_for_application(uuid);

create or replace function public.resume_fit_for_application(
  application_id uuid,
  top_k          int default 5
)
returns table (
  chunk_id        uuid,
  resume_id       uuid,
  resume_label    text,
  similarity      float,
  section_label   text,
  section_text    text,
  section_ordinal int
)
language sql
security invoker
set search_path = ''
as $$
  select
    c.id,
    r.id,
    r.label,
    (1 - (c.embedding operator(extensions.<=>) a.embedding))::float as similarity,
    c.section_label,
    c.section_text,
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
  limit top_k;
$$;

-- ------------------------------------------------------------
-- 4. score_external_job_resume -- top-K candidates for the
--    extension overlay. Same security definer + p_user_id
--    filter as the previous version.
-- ------------------------------------------------------------
drop function if exists public.score_external_job_resume(uuid, text);

create or replace function public.score_external_job_resume(
  p_user_id uuid,
  p_query   text,
  p_top_k   int default 5
)
returns table (
  resume_label  text,
  similarity    float,
  section_label text,
  section_text  text
)
language sql
security definer
set search_path = ''
as $$
  select
    r.label,
    (1 - (c.embedding operator(extensions.<=>) p_query::extensions.vector))::float as similarity,
    c.section_label,
    c.section_text
  from public.resume_chunks c
  join public.resumes r on r.id = c.resume_id
  where r.user_id = p_user_id
    and r.is_active
    and c.embedding is not null
  order by c.embedding operator(extensions.<=>) p_query::extensions.vector
  limit p_top_k;
$$;

revoke execute on function
  public.score_external_job_resume(uuid, text, int)
from anon, authenticated;
