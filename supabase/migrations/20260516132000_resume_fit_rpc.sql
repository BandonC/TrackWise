-- ============================================================
-- Resume-fit RPC + hardening for request_resume_embedding
--
-- 1. resume_fit_for_application(application_id) — returns the
--    cosine similarity between the caller's currently-active
--    resume and the supplied application's embedding.
--
--    Security model: security invoker, pinned search_path = ''.
--    RLS on `resumes` filters the resume scan to the caller.
--    RLS on `applications` filters the target lookup to the
--    caller. The function therefore cannot leak across users
--    even if called with someone else's application_id — the
--    cross join yields zero rows.
--
--    Returns at most one row (the active resume). If the user
--    has no active resume, no resume embedding yet, or the
--    target application has no embedding, the function returns
--    zero rows. Callers render an empty state.
--
-- 2. Revoke execute on request_resume_embedding from anon and
--    authenticated. Mirrors the day-6 hardening of
--    request_embedding: a SECURITY DEFINER trigger function
--    should not be reachable through /rest/v1/rpc.
-- ============================================================

revoke execute on function public.request_resume_embedding() from anon, authenticated;

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
