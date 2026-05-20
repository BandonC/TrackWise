-- ============================================================
-- Resume fit -> LLM reasoning column (PR-C3)
--
-- PR-C2 (rerank-2.5) measurably widened the spread between
-- matching and control jobs but left the detail-page scoring
-- bounded by the rerank query's poverty: it's built as
-- `${role} at ${company}. ${notes ?? ''}` and for a default
-- extension save (empty notes) that's ~20-50 characters of
-- input. Rerank can't infer that "AI Engineer at Prepr" likely
-- wants ML/Python from the title alone.
--
-- PR-C3 replaces rerank with a Claude Haiku call that reasons
-- about the role from its title + the candidate resume chunks
-- and returns a 0-100 fit score AND a one-sentence reason.
-- The reason is the product differentiator -- a number alone
-- doesn't help the user understand WHY a job is or isn't a
-- fit. Persist it alongside the existing cache columns.
--
-- Invalidation reuses the row-local trigger added in
-- 20260520120000_resume_fit_rerank.sql; this migration extends
-- the trigger function to null the new column too.
-- ============================================================

-- ------------------------------------------------------------
-- 1. New cache column. Nullable -- pre-C3 rows and cache misses
--    coexist with the existing similarity/section_label columns
--    in the same null-or-set lockstep.
-- ------------------------------------------------------------
alter table public.applications
  add column resume_fit_reasoning text;

-- ------------------------------------------------------------
-- 2. Extend the row-local invalidation trigger function. The
--    trigger binding (on_application_embedding_change_invalidate_fit)
--    is unchanged -- we only replace the function body to also
--    clear resume_fit_reasoning.
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
  new.resume_fit_reasoning := null;
  new.resume_fit_computed_at := null;
  return new;
end;
$$;

revoke execute on function public.invalidate_application_fit_cache()
  from anon, authenticated;
