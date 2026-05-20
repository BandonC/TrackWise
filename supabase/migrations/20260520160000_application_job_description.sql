-- ============================================================
-- applications.job_description (PR-D1)
--
-- The Chrome extension parses the JD body from LinkedIn and
-- Indeed at save time and stores it here, distinct from `notes`
-- (which stays for user-authored commentary).
--
-- Two downstream effects:
--   1. generate-embedding includes job_description in the
--      source text. The cosine pre-filter then sees a rich
--      signal (full JD vocabulary) instead of the prior
--      ~20-50 char "role at company" string.
--   2. The Haiku scoring query (score-resume-fit and
--      score-external-job) includes a truncated JD so the
--      model judges against the actual posting when one is
--      available -- not only what it can infer from the role
--      title.
--
-- Editing job_description re-fires the embedding trigger; the
-- existing chain (embedding regenerates -> fit cache nulled
-- row-locally by invalidate_application_fit_cache) handles
-- cache invalidation without further plumbing.
-- ============================================================

alter table public.applications
  add column job_description text;

-- Replace the embedding trigger so updates to job_description
-- also re-embed. CREATE TRIGGER doesn't support OR REPLACE for
-- the column list, so drop + recreate.
drop trigger if exists on_application_updated_embed on public.applications;

create trigger on_application_updated_embed
  after update of company, role, notes, job_description on public.applications
  for each row execute function public.request_embedding();
