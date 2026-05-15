-- ============================================================
-- Function-security hardening (advisor remediation)
--
-- 1. Revoke EXECUTE on public.request_embedding from anon and authenticated.
--    The function is SECURITY DEFINER and meant to be invoked only by
--    triggers on applications. Without this revoke it is callable via
--    /rest/v1/rpc/request_embedding by any signed-in or anonymous client.
--    (It would error on NEW being null when called outside a trigger, but
--    least-privilege says don't expose it at all.)
--
-- 2. Pin search_path = '' on log_application_created, log_status_change,
--    and find_similar_applications. Function bodies are updated to use
--    fully-qualified names where required (public.application_events,
--    public.applications). The pgvector operator was already qualified
--    via extensions.<=>.
-- ============================================================

revoke execute on function public.request_embedding() from anon, authenticated;

-- ------------------------------------------------------------
-- log_application_created
-- ------------------------------------------------------------
create or replace function public.log_application_created()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.application_events (application_id, user_id, event_type)
  values (new.id, new.user_id, 'created');
  return new;
end;
$$;

-- ------------------------------------------------------------
-- log_status_change
-- ------------------------------------------------------------
create or replace function public.log_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.application_events
      (application_id, user_id, event_type, from_status, to_status)
    values
      (new.id, new.user_id, 'status_change', old.status, new.status);
  end if;
  new.last_updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- find_similar_applications
-- ------------------------------------------------------------
create or replace function public.find_similar_applications(
  target_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  company text,
  role text,
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
      and embedding is not null
  ) target
  where a.id <> target_id
    and a.embedding is not null
  order by a.embedding operator(extensions.<=>) target.embedding
  limit match_count;
$$;
