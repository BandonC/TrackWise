-- ============================================================
-- score_external_job_* helper RPCs
--
-- Pair with the score-external-job Edge Function. The function
-- has already verified the caller's JWT and extracted user_id;
-- it then calls service-role with an explicit user_id filter
-- (the RPCs are called from service-role context, which means
-- RLS is bypassed — we re-enforce the user scope inside the SQL
-- via the p_user_id parameter).
--
-- These functions are SECURITY DEFINER but pinned to the public
-- schema and unreachable from /rest/v1/rpc by anon/authenticated
-- (execute is revoked below). The Edge Function is the only
-- legitimate caller; it provides its own auth.
-- ============================================================

-- ------------------------------------------------------------
-- score_external_job_history
-- Best cosine match between p_query and the user's applications.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- score_external_job_resume
-- Active-resume fit for the user.
-- ------------------------------------------------------------
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
-- Revoke from anon/authenticated. Only service-role (the Edge
-- Function) should call these.
-- ------------------------------------------------------------
revoke execute on function
  public.score_external_job_history(uuid, text),
  public.score_external_job_resume(uuid, text)
from anon, authenticated;
