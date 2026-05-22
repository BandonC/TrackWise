-- ============================================================
-- Pre-CWS hardening (2026-05-22)
--
-- 1. Per-user rate limit for the fit-score Edge Functions
--    (score-resume-fit, score-external-job). Each function calls
--    check_fit_score_rate_limit(user_id) before doing any
--    Anthropic/Voyage work. Raises a specific exception that the
--    function maps to a 429 response so a misbehaving (or
--    compromised) account can't burn unbounded LLM budget.
--
--    Limits are deliberately generous for normal use: 30/min and
--    500/day per user. The most active legitimate case is a user
--    browsing 30 jobs in an hour and clicking Check fit on each --
--    well within bounds. An attacker spinning up many Google
--    accounts to abuse the endpoints is bounded to ~500 LLM calls
--    per account per day, which keeps Anthropic exposure linear in
--    attacker effort rather than free.
--
-- 2. Index on application_events.application_id. The detail page
--    queries application_events filtered by application_id; the
--    FK does not create an index automatically in Postgres. Solo
--    user with few events sees no difference; the index is a
--    cheap forward-compat for scale.
-- ============================================================

-- ------------------------------------------------------------
-- 1. fit_score_call_log -- one row per scored call.
--    No RLS policy means only service_role (the Edge Function
--    callers) can read or write. RLS still enabled so any
--    accidental anon/authenticated query returns zero rows
--    rather than the table being inadvertently exposed.
-- ------------------------------------------------------------
create table public.fit_score_call_log (
  user_id   uuid        not null references auth.users(id) on delete cascade,
  called_at timestamptz not null default now()
);

create index fit_score_call_log_user_called_at_idx
  on public.fit_score_call_log (user_id, called_at desc);

alter table public.fit_score_call_log enable row level security;
-- Intentionally no policy: clients should never read or write this
-- table directly. Edge Functions go through service_role which
-- bypasses RLS.

revoke all on table public.fit_score_call_log from anon;
revoke all on table public.fit_score_call_log from authenticated;
grant  all on table public.fit_score_call_log to   service_role;

-- ------------------------------------------------------------
-- 2. check_fit_score_rate_limit -- raises if the caller has
--    exceeded a per-minute or per-day quota; otherwise logs the
--    call. Single round-trip from the Edge Function.
--
--    security definer because the table grants service_role only;
--    the function intentionally bypasses RLS so the count is
--    accurate across rows the caller would not normally see.
-- ------------------------------------------------------------
create or replace function public.check_fit_score_rate_limit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  count_per_min int;
  count_per_day int;
begin
  select count(*) into count_per_min
  from public.fit_score_call_log
  where user_id = p_user_id
    and called_at > now() - interval '1 minute';

  if count_per_min >= 30 then
    raise exception 'rate_limit_per_minute' using errcode = 'P0001';
  end if;

  select count(*) into count_per_day
  from public.fit_score_call_log
  where user_id = p_user_id
    and called_at > now() - interval '1 day';

  if count_per_day >= 500 then
    raise exception 'rate_limit_per_day' using errcode = 'P0001';
  end if;

  insert into public.fit_score_call_log (user_id) values (p_user_id);

  -- Probabilistic cleanup: 1% of calls sweep rows older than 2 days
  -- so the table doesn't grow unbounded. Cheap because the index
  -- on (user_id, called_at desc) doesn't help this scan -- but it's
  -- rare enough that the cost amortizes to near zero.
  if random() < 0.01 then
    delete from public.fit_score_call_log
    where called_at < now() - interval '2 days';
  end if;
end;
$$;

-- Only service_role calls this; anon/authenticated have no path.
revoke execute on function public.check_fit_score_rate_limit(uuid)
  from public, anon, authenticated;
grant  execute on function public.check_fit_score_rate_limit(uuid)
  to     service_role;

-- ------------------------------------------------------------
-- 3. application_events index. The detail page filters by
--    application_id; without an explicit index the planner falls
--    back to seq-scan + RLS filter. Cheap to add, future-proofs.
-- ------------------------------------------------------------
create index application_events_application_id_idx
  on public.application_events (application_id);
