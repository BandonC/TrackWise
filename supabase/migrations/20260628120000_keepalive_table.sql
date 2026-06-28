-- ============================================================
-- keep-alive: real database write
--
-- The original ping() (20260610232754) returned a constant
-- ('select ''ok''') and touched no table. Supabase's free-tier
-- inactivity timer tracks *database activity*; a constant function
-- did not reliably register as such, and the project paused on
-- 2026-06-22 despite a green keep-alive run four days earlier.
--
-- This replaces ping() with an unambiguous write against a tiny
-- singleton table. The table holds no user data: a single row
-- whose timestamp is bumped on every ping.
--
-- RLS is enabled with no policies, so the table is unreachable
-- through the Data API by anon/authenticated. ping() is
-- security definer (owner bypasses RLS) with a locked search_path,
-- so the only write path is the function itself -- callable by
-- anon without granting anon any table access.
-- ============================================================

create table public.keepalive (
  -- Singleton: the check constraint forbids any id but true,
  -- so the table can never hold more than one row.
  id boolean primary key default true,
  last_ping timestamptz not null default now(),
  constraint keepalive_singleton check (id)
);

insert into public.keepalive (id) values (true);

alter table public.keepalive enable row level security;
-- No policies on purpose: blocks all direct PostgREST access.
-- Writes happen only through ping() below (security definer).

create or replace function public.ping()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  update public.keepalive set last_ping = now() where id;
  select 'ok'::text;
$$;

-- Explicit grants survive the Oct 2026 Data API default change
-- (same rationale as the explicit table grants migration).
grant execute on function public.ping() to anon, authenticated, service_role;
