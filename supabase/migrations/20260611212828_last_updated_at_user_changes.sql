-- ============================================================
-- last_updated_at: bump only on user-facing changes
--
-- log_status_change() unconditionally refreshed last_updated_at on
-- every update, so machine writes silently reset the staleness signal
-- the dashboard surfaces. Three such write paths exist today:
--   - generate-embedding write-back (embedding, embedding_source)
--   - fit-score cache on detail-page view (resume_fit_*)
--   - cluster recompute (cluster_id, every embedded row at once)
--
-- Fix: compare OLD and NEW as jsonb with the machine-written columns
-- (and last_updated_at itself) removed, and bump only when the rest
-- differs. If a future migration adds another machine-written column,
-- it must be appended to system_cols here in a follow-up migration.
-- ============================================================

create or replace function public.log_status_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  system_cols constant text[] := array[
    'embedding',
    'embedding_source',
    'cluster_id',
    'resume_fit_similarity',
    'resume_fit_section_label',
    'resume_fit_reasoning',
    'resume_fit_computed_at',
    'last_updated_at'
  ];
begin
  if old.status is distinct from new.status then
    insert into public.application_events
      (application_id, user_id, event_type, from_status, to_status)
    values
      (new.id, new.user_id, 'status_change', old.status, new.status);
  end if;
  if (to_jsonb(old) - system_cols) is distinct from (to_jsonb(new) - system_cols) then
    new.last_updated_at := now();
  end if;
  return new;
end;
$$;
