-- ============================================================
-- Input hardening: length CHECKs, resume_chunks write revoke,
-- per-user row quotas
--
-- RLS scopes rows per user but puts no bound on what a signed-in
-- user can write through PostgREST directly (bypassing app-level
-- validation). Three cheap layers:
--
-- 1. char_length CHECKs on every free-text column a client can
--    write. Limits sit far above legitimate use (remote maxima at
--    migration time: job_description 7616, source_url 1216,
--    resumes.content 3388) but cap junk storage and keep
--    embedding/scoring inputs sane. NULLs pass automatically.
--
-- 2. Revoke INSERT/UPDATE/DELETE on resume_chunks from
--    authenticated. Chunks are written only by the service-role
--    generate-resume-embedding function; clients only read them.
--    The full-CRUD grant in 20260519120000 was broader than any
--    legit client path.
--
-- 3. BEFORE INSERT quota triggers: applications <= 5000/user,
--    resumes <= 20/user. Caps storage abuse by a hostile token.
--    security invoker: the count runs under the inserting user's
--    RLS, and with check already pins new.user_id = auth.uid().
--
-- Accepted residual (deliberate, do not "fix" casually):
--   - application_events INSERT grant stays — the security invoker
--     event triggers insert as the user, so revoking would break
--     status logging. No quota on events: bounded in practice by
--     the applications quota, and a per-insert count would need a
--     new index for marginal benefit.
--   - No CHECKs on salary_min/salary_max: no write path exists.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Length CHECKs
-- ------------------------------------------------------------
alter table public.applications
  add constraint applications_company_len         check (char_length(company)         <= 200),
  add constraint applications_role_len            check (char_length(role)            <= 200),
  add constraint applications_location_len        check (char_length(location)        <= 200),
  add constraint applications_source_url_len      check (char_length(source_url)      <= 2000),
  add constraint applications_source_site_len     check (char_length(source_site)     <= 50),
  add constraint applications_notes_len           check (char_length(notes)           <= 5000),
  add constraint applications_job_description_len check (char_length(job_description) <= 10000);

alter table public.resumes
  add constraint resumes_label_len   check (char_length(label)   <= 100),
  add constraint resumes_content_len check (char_length(content) <= 50000);

-- ------------------------------------------------------------
-- 2. resume_chunks: clients read, only service_role writes
-- ------------------------------------------------------------
revoke insert, update, delete on table public.resume_chunks from authenticated;

-- ------------------------------------------------------------
-- 3. Per-user row quotas
-- ------------------------------------------------------------
create or replace function public.enforce_application_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.applications where user_id = new.user_id) >= 5000 then
    raise exception 'application limit reached (5000 per user)';
  end if;
  return new;
end;
$$;

create trigger on_application_quota
  before insert on public.applications
  for each row execute function public.enforce_application_quota();

create or replace function public.enforce_resume_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.resumes where user_id = new.user_id) >= 20 then
    raise exception 'resume limit reached (20 per user)';
  end if;
  return new;
end;
$$;

create trigger on_resume_quota
  before insert on public.resumes
  for each row execute function public.enforce_resume_quota();
