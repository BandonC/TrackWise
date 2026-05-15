-- Restore EXECUTE on request_embedding for the `authenticated` role only.
--
-- Context: the previous PUBLIC revoke also blocked the trigger path. When
-- a signed-in user inserts an application, Postgres checks EXECUTE on the
-- trigger function before invoking it; without PUBLIC, authenticated users
-- had no grant, so the embedding trigger silently no-op'd.
--
-- Granting to `authenticated` only:
--   - lets the trigger fire (every insert path requires an authenticated
--     session — RLS blocks anon writes)
--   - leaves anon without REST-RPC access (advisor 0028 cleared)
--   - leaves the authenticated REST-RPC exposure as a known WARN
--     (advisor 0029). Calling /rest/v1/rpc/request_embedding directly
--     errors on `NEW.id` (record not assigned), so the exposure is not
--     exploitable, just noisy. A v2 cleanup will move the function to a
--     non-API schema (e.g. `private`) to silence this entirely.

grant execute on function public.request_embedding() to authenticated;
