-- ============================================================
-- Analytics views
-- All views set security_invoker = on so RLS on the underlying
-- tables (applications, application_events) is evaluated against
-- the caller, not the view owner.
-- ============================================================

-- ------------------------------------------------------------
-- v_response_rate
-- One row per user. Aggregate totals + responded + rate, where
-- "responded" is the current-status definition (status != 'applied').
-- ------------------------------------------------------------
create view v_response_rate
with (security_invoker = on) as
select
  user_id,
  applied_at,
  status
from applications;

-- The view above is intentionally row-level (one row per application)
-- so callers can apply a date-range filter on applied_at before
-- aggregating. Aggregation happens in the dashboard query, not here.
-- This keeps the view shareable across "last 30 days", "last 90 days",
-- and "all time" without baking a window into the view.

-- ------------------------------------------------------------
-- v_time_to_response
-- One row per application. days_to_response is null when the
-- application has not yet received a non-'applied' status change.
-- ------------------------------------------------------------
create view v_time_to_response
with (security_invoker = on) as
select
  a.id,
  a.user_id,
  a.applied_at,
  min(e.created_at) filter (where e.to_status is distinct from 'applied')
    as first_response_at,
  extract(epoch from (
    min(e.created_at) filter (where e.to_status is distinct from 'applied')
    - a.applied_at
  )) / 86400 as days_to_response
from applications a
left join application_events e
  on e.application_id = a.id
  and e.event_type = 'status_change'
group by a.id, a.user_id, a.applied_at;

-- ------------------------------------------------------------
-- v_response_by_source
-- One row per application with source_site bucketed. Aggregation
-- is deferred to the caller so the same date-range filter pattern
-- applies as v_response_rate.
-- ------------------------------------------------------------
create view v_response_by_source
with (security_invoker = on) as
select
  user_id,
  coalesce(source_site, 'unknown') as source_site,
  applied_at,
  status
from applications;
