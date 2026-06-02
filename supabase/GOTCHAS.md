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

## User-facing Edge Functions need explicit CORS headers

The Supabase REST API has CORS configured globally, but Edge Functions
do not. Any function called from a browser, extension, or any
cross-origin client must:

1. Handle the `OPTIONS` preflight request and return CORS headers.
2. Include CORS headers on every actual response too.

Without this, the fetch surfaces as `Failed to send a request to the
Edge Function` — a *network* error, not an HTTP error — because the
browser blocks the response before it reaches the client.

Skeleton:

```ts
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  // ... do work ...
  return new Response(JSON.stringify(body), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
```

Trigger-invoked functions (`generate-embedding`,
`generate-resume-embedding`) don't need CORS — pg_net is a Postgres
client, not a browser.

### CORS preflight + JWT gateway: deploy user-facing functions with `--no-verify-jwt`

If a user-facing function is deployed with JWT verification ON (the
default), the Supabase gateway rejects the browser's `OPTIONS`
preflight with 401 before it reaches the function — preflight requests
don't carry an `Authorization` header. The function's own CORS handler
never runs, and the browser blocks the real POST.

Symptom: `Response to preflight request doesn't pass access control
check: No 'Access-Control-Allow-Origin' header is present on the
requested resource.`

Fix: deploy with `--no-verify-jwt` AND verify the JWT manually inside
the function via `supabase.auth.getUser(token)`. Same security
guarantee, plus OPTIONS now flows through to our CORS handler. This is
how `score-external-job` is configured.

Counter-example: `score-resume-fit` is user-facing too but is called
server-to-server from the dashboard's Server Component (which forwards
the user's session JWT), never cross-origin from a browser. It has no
CORS preflight, so it keeps `verify_jwt = true` (the gateway default,
no `--no-verify-jwt`) and still resolves the user via
`supabase.auth.getUser(token)` for rate limiting. "User-facing" alone
doesn't imply `--no-verify-jwt` — only a cross-origin browser caller
does.

## SQL editor runs as `postgres`, not as a user

`auth.uid()` returns `null` in the SQL editor. Any insert into a user-data
table needs an explicit `user_id`. Grab one with
`select distinct user_id from applications limit 1;` and paste it into the
insert.

This matters for smoke-testing RLS-protected tables. To actually exercise RLS
you need to be signed in via the dashboard, not the SQL editor.
