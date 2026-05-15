-- Future-proof against the Supabase Data API default change.
--
-- Background: starting Oct 30, 2026 for existing projects, Supabase will
-- stop granting public-schema tables to anon/authenticated/service_role
-- implicitly. Apps that rely on supabase-js or direct /rest/v1 calls need
-- explicit GRANTs. Without them, PostgREST returns 42501.
--
-- TrackWise needs:
--   - authenticated: full CRUD on applications + application_events
--     (RLS scopes rows to the calling user; see initial migration).
--   - authenticated: SELECT on the analytics views.
--   - service_role: ALL on tables; SELECT on views (used by admin paths
--     and the embedding Edge Function).
--   - anon: NOTHING. TrackWise is authenticated-only. Revoking removes
--     the never-used implicit grant and clears related lint surface.

-- ------------------------------------------------------------
-- Strip anon
-- ------------------------------------------------------------
revoke all on table public.applications          from anon;
revoke all on table public.application_events    from anon;
revoke all on table public.v_response_rate       from anon;
revoke all on table public.v_time_to_response    from anon;
revoke all on table public.v_response_by_source  from anon;

-- ------------------------------------------------------------
-- Explicit authenticated grants
-- ------------------------------------------------------------
grant select, insert, update, delete on public.applications        to authenticated;
grant select, insert, update, delete on public.application_events  to authenticated;

grant select on public.v_response_rate       to authenticated;
grant select on public.v_time_to_response    to authenticated;
grant select on public.v_response_by_source  to authenticated;

-- ------------------------------------------------------------
-- Explicit service_role grants (edge functions, admin paths)
-- ------------------------------------------------------------
grant all on public.applications        to service_role;
grant all on public.application_events  to service_role;

grant select on public.v_response_rate       to service_role;
grant select on public.v_time_to_response    to service_role;
grant select on public.v_response_by_source  to service_role;
