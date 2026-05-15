# TrackWise sanity tests

Three test layers, run in order:

1. **Static** (`static.ps1`) — typecheck + lint + build for dashboard and extension.
2. **DB invariants** (`db-invariants.sql`) — schema/RLS/triggers/views/RPC assertions against the linked Supabase project. Runs via `supabase db query` (or paste into the SQL editor).
3. **E2E live** (`e2e.mjs`) — creates two throwaway users, exercises insert/update/RLS/embedding/similarity/analytics, then deletes the users.

## Setup

Copy `.env.local.example` to `test/.env.local` and fill in:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`test/.env.local` is gitignored by the root `.gitignore` (`.env.*.local`).

## Run

```powershell
pwsh test/run-all.ps1            # static + e2e
pwsh test/static.ps1             # just static checks
node  test/e2e.mjs               # just e2e
```

For DB invariants, see the comment at the top of `db-invariants.sql`.

## Browser smoke

Manual. Run `pnpm --filter dashboard dev`, log in, click through:

- `/` (kanban) — drag a card to a new column, verify it persists on reload
- `/analytics` — all four charts render, date filter switches data
- `/applications/<id>` — detail loads, similar applications section renders (may be empty if <2 embedded apps)
- `/settings` — page loads
- Sign out, confirm `(app)` routes redirect to `/login`
