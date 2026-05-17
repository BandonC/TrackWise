# Supabase gotchas (TrackWise-specific)

Things that have bitten us. Read before adding a new Edge Function or pg_net trigger.

## Trigger-invoked Edge Functions need `--no-verify-jwt`

By default `supabase functions deploy <name>` enables JWT verification at the
gateway. Any request without `Authorization: Bearer <jwt>` is rejected with
`401` and `content_type: application/json` **before reaching your function**
— so your own `x-internal-secret` check never runs and the function logs show
nothing useful.

pg_net triggers don't send a JWT (they send the shared-secret header instead).
For any function invoked by a pg_net trigger, deploy with:

```powershell
supabase functions deploy <name> --no-verify-jwt
```

Existing functions deployed this way: `generate-embedding`,
`generate-resume-embedding`.

Symptom when you forget: `net._http_response` shows `status_code = 401`,
`content_type = application/json` (Supabase's gateway 401 — your function's
own 401 would be plain text).

## Vault URLs must include the `https://` scheme

`vault.create_secret('<url>', 'name')` will happily store a URL without a
scheme. When pg_net later tries to encode it, the URL parser inside
`net._encode_url_with_params_array` throws `XX000: Out of memory` — not a
clear "malformed URL" error.

Always store full URLs:

```sql
select vault.create_secret(
  'https://<ref>.supabase.co/functions/v1/<function>',
  '<secret-name>'
);
```

Symptom when you forget: `Out of memory` from `net.http_post` calls,
even though the queue (`net.http_request_queue`) is nearly empty.

Fix in place:

```sql
select vault.update_secret(s.id, 'https://' || s.decrypted_secret)
from vault.decrypted_secrets s
where s.name = '<secret-name>';
```

## SQL editor runs as `postgres`, not as a user

`auth.uid()` returns `null` in the SQL editor. Any insert into a user-data
table needs an explicit `user_id`. Grab one with
`select distinct user_id from applications limit 1;` and paste it into the
insert.

This matters for smoke-testing RLS-protected tables. To actually exercise RLS
you need to be signed in via the dashboard, not the SQL editor.
