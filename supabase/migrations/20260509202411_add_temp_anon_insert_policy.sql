-- ============================================================
-- TEMP: Day 2 MVP stopgap.
--
-- Allows the Chrome extension to insert applications without an
-- authenticated session, using a hardcoded user_id in the payload.
-- The existing "users access own ..." policies still gate SELECT,
-- UPDATE, and DELETE — only INSERT is permissively bypassed, and
-- only for the anon role (authenticated users still hit the
-- standard user_id = auth.uid() check).
--
-- application_events needs the same permissive insert policy because
-- the on_application_created trigger is security invoker, so the
-- trigger's insert runs as anon and would otherwise be blocked,
-- failing the whole transaction.
--
-- REMOVE THIS in the Day 3 migration that wires chrome.identity
-- OAuth into the extension. Both policies must be dropped together.
-- ============================================================

create policy "temp_anon_insert"
  on applications
  for insert
  to anon
  with check (true);

create policy "temp_anon_insert"
  on application_events
  for insert
  to anon
  with check (true);

comment on policy "temp_anon_insert" on applications is
  'TEMP stopgap. Remove on Day 3 when chrome.identity auth lands.';

comment on policy "temp_anon_insert" on application_events is
  'TEMP stopgap. Remove on Day 3 when chrome.identity auth lands.';
