-- ============================================================
-- Resume chunks
--
-- Section-level pieces of a resume. One resume produces N rows
-- here -- one per section (skills, education, summary) and one
-- per item within Projects / Experience (per-project, per-role).
--
-- Motivation: PR-C1 (voyage-3-lite -> voyage-3, see
-- 20260518120000_voyage3_upgrade.sql) lifted ranking quality but
-- left absolute fit scores in the 40s on strong matches. Reason:
-- a single resume vector is an average across all sections; the
-- average looks like nothing in particular, so cosine similarity
-- against a concrete job posting stays low even for a real fit.
-- Per-section chunks + max-pool over chunks gives the model a
-- direct comparison between the matching part of the resume and
-- the job. See TrackWise.md s10 (decision log entry for PR-C2,
-- to be added in the docs step of this PR).
--
-- This migration is ADDITIVE. It does not touch resumes.embedding
-- and does not change any RPC. A later migration in this PR will
-- drop resumes.embedding and swap the fit RPCs to query this
-- table; that ordering keeps fit scores live throughout the
-- rollout (additive table -> deploy function -> backfill ->
-- swap RPCs + drop column).
--
-- user_id is denormalized from resumes for RLS simplicity. The
-- standard "users access own X" policy depends on a direct
-- user_id column on the table being policied -- chasing through
-- the resume_id FK with a subquery is the pattern supabase/CLAUDE.md
-- explicitly warns against ("Postgres can't always optimize them
-- and you'll hit perf cliffs"). Cascade on auth.users(id) matches
-- the resumes table so a user delete cleans up everything.
-- ============================================================

-- ------------------------------------------------------------
-- Table
-- ------------------------------------------------------------
create table resume_chunks (
  id                uuid        primary key default gen_random_uuid(),
  resume_id         uuid        not null references resumes(id)    on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  section_label     text        not null,
  section_text      text        not null,
  ordinal           int         not null,
  embedding         extensions.vector(1024),
  embedding_source  text,
  created_at        timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Row-level security
-- ------------------------------------------------------------
alter table resume_chunks enable row level security;

create policy "users access own resume_chunks"
  on resume_chunks for all
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- Indexes
-- resume_id: chunk fetches per resume + supports the FK cascade.
-- user_id:   RLS policy filters on this column directly.
-- (resume_id, ordinal) unique: guards against duplicate ordinals
--   if a fan-out insert ever runs twice.
-- ------------------------------------------------------------
create index resume_chunks_resume_id_idx
  on resume_chunks (resume_id);

create index resume_chunks_user_id_idx
  on resume_chunks (user_id);

create unique index resume_chunks_resume_id_ordinal_key
  on resume_chunks (resume_id, ordinal);

-- ------------------------------------------------------------
-- Grants
-- Mirrors the explicit-grants pattern from
-- 20260514234000_explicit_table_grants.sql and resumes.
-- ------------------------------------------------------------
revoke all on table public.resume_chunks from anon;

grant select, insert, update, delete on public.resume_chunks to authenticated;
grant all                            on public.resume_chunks to service_role;
