-- Revoke EXECUTE on request_embedding from the special PUBLIC role.
-- Postgres grants EXECUTE to PUBLIC by default at function creation, which
-- cascades to anon and authenticated regardless of role-specific revokes.
-- Triggers still work — they run as the function's owner, not via PUBLIC.

revoke execute on function public.request_embedding() from public;
