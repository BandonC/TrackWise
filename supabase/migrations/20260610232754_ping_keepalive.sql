-- ============================================================
-- ping() keep-alive RPC
--
-- Target of the keep-alive GitHub Action (TrackWise.md s7.5).
-- Supabase pauses free-tier projects after 7 days of inactivity;
-- the Action calls /rest/v1/rpc/ping twice a week so the project
-- registers database activity.
--
-- anon has no table grants (stripped in
-- 20260514234000_explicit_table_grants.sql), so the Action needs
-- a callable-by-anon endpoint that touches Postgres without
-- exposing any data. A constant SQL function is exactly that:
-- no table access, no input, no RLS surface.
-- ============================================================

create or replace function public.ping()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'ok'::text;
$$;

-- Explicit grants survive the Oct 2026 Data API default change
-- (same rationale as the explicit table grants migration).
grant execute on function public.ping() to anon, authenticated, service_role;
