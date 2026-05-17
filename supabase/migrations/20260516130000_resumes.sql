-- ============================================================
-- Resumes
--
-- Per-user resume store for the day-11 resume-fit feature.
-- Content is plain text (paste-input only in v1; see TrackWise.md §10).
-- Embedded once on insert and on content change via the same
-- pg_net trigger pattern used for applications. The embedding is
-- consumed by resume_fit_for_application(...) (next migration).
--
-- Multiple rows per user are allowed; exactly one row per user is
-- flagged is_active. The server action that writes a resume is
-- responsible for flipping previously-active rows to false. v2
-- (TrackWise.md §8.2 "resume version tagging") will surface the
-- inactive rows in the UI; v1 ignores them.
-- ============================================================

-- ------------------------------------------------------------
-- Table
-- ------------------------------------------------------------
create table resumes (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  label             text        not null,
  content           text        not null,
  is_active         boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  embedding         extensions.vector(512),
  embedding_source  text
);

-- ------------------------------------------------------------
-- Row-level security
-- ------------------------------------------------------------
alter table resumes enable row level security;

create policy "users access own resumes"
  on resumes for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- Indexes
-- Partial unique index enforces the "one active resume per user"
-- invariant at the database level, not just in application code.
-- ------------------------------------------------------------
create index resumes_user_id_idx
  on resumes (user_id);

create unique index resumes_one_active_per_user
  on resumes (user_id)
  where is_active;

-- ------------------------------------------------------------
-- Trigger: bump updated_at on any update
-- ------------------------------------------------------------
create or replace function touch_resumes_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger on_resume_updated
  before update on resumes
  for each row execute function touch_resumes_updated_at();

-- ------------------------------------------------------------
-- Grants
-- Mirrors the explicit-grants pattern established in
-- 20260514234000_explicit_table_grants.sql.
-- ------------------------------------------------------------
revoke all on table public.resumes from anon;

grant select, insert, update, delete on public.resumes to authenticated;
grant all                            on public.resumes to service_role;
