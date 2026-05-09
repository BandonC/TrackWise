# TrackWise Supabase

Database migrations, Edge Functions, and anything else that lives in the Supabase project. Read [the root CLAUDE.md](../CLAUDE.md) first — this file only adds Supabase-specific rules.

## Things I need to fill in

- The Supabase project ref (subdomain) for `supabase link`
- The database password (set during project creation, used by the CLI)
- The Voyage AI API key, set as a secret via `supabase secrets set VOYAGE_API_KEY=...`
- For local dev: `supabase start` requires Docker running

If any of these aren't set when you need them, ask. Don't fabricate a project ref.

## Layout

```
supabase/
  migrations/
    YYYYMMDDHHMMSS_<name>.sql    # Numbered, append-only.
  functions/
    generate-embedding/
      index.ts                   # Deno; embedding generation.
  config.toml                    # Local dev config.
  CLAUDE.md                      # This file.
```

## Migration rules

**Migrations are append-only and immutable once committed.** Once a migration has been pushed to the remote project, never edit it. Always write a new migration to fix or change something.

- Create a new migration with `supabase migration new <name>`.
- Filename format: `YYYYMMDDHHMMSS_<name>.sql` — the CLI handles the timestamp.
- Each migration should be a single logical change. Don't pile schema changes for two unrelated features into one file.
- Test locally with `supabase db reset` before pushing. This drops the local DB and re-runs all migrations from scratch — if something breaks, you'll see it now.
- Push to remote with `supabase db push`.

### What every migration that creates a user-data table must include

In a single file, in this order:

1. The `create table` statement.
2. `alter table <name> enable row level security;`
3. The RLS policies (one per operation, or `for all` if same condition).
4. Any indexes.
5. Any triggers.

If a migration creates a table without enabling RLS in the same file, that's a bug. Even if I forget to ask, refuse to write it that way.

### RLS policy pattern

The standard policy for user-owned data:

```sql
create policy "users access own <thing>"
  on <table> for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

Both `using` and `with check` matter — `using` filters reads, `with check` filters writes. Forgetting `with check` lets users insert rows belonging to other users.

For tables joined to a parent (like `application_events` linked to `applications`), the policy should still check `user_id = auth.uid()` directly on the child table. Don't try to be clever with subqueries on the parent table — Postgres can't always optimize them and you'll hit perf cliffs.

### Triggers

We use triggers for two things:

- **Status-change logging** on `applications` — inserts a row into `application_events` whenever `status` changes. This means **client code must never write to `application_events` for status changes.** If the client is doing that, the trigger is broken.
- **Embedding generation** on `applications` — fires `pg_net.http_post` to the `generate-embedding` Edge Function on insert. Fire-and-forget; the embedding column starts null and gets populated asynchronously.

When adding a trigger, write a function with `security invoker` (the default) unless we have a specific reason for `security definer`. `security definer` bypasses RLS and is dangerous if misused.

### pgvector specifics

- The embedding dimension is **512**, matching `voyage-3-lite` output. If you ever change the embedding model, the column type must change and all existing embeddings must be regenerated. This is a migration that requires care — flag it instead of doing it casually.
- The IVFFlat index is fine up to a few thousand rows. Past that, consider HNSW. Not a v1 concern.
- Cosine distance operator is `<=>`. Similarity is `1 - distance`. Don't mix up `<=>` (cosine), `<->` (euclidean), and `<#>` (negative inner product) — they'll all "work" but give wildly different rankings.

## Extensions

Extension setup (`create extension`, `create schema`) belongs in `supabase/roles.sql`, not in migrations. `roles.sql` runs before migrations on `supabase start` and `supabase db reset`, and is not pushed to remote unless `--include-roles` is explicitly passed to `supabase db push`. This is the only supported pre-migration hook.

Migrations that reference an extension type (e.g. `extensions.vector(512)`) depend on that extension already being present via `roles.sql`. Never put `create extension` statements in a migration file.

## Postgres views for analytics

Views are the source of truth for analytics queries. They live in migrations like everything else.

- Views inherit RLS from their underlying tables — but only when the view is `security invoker` (the default for `create view`). Don't use `security definer` views without a strong reason.
- Name views `v_<thing>` so they're easy to spot.
- Don't materialize unless we hit a real perf issue. Plain views are simpler and always fresh.

## Edge Functions

Edge Functions run Deno, not Node. Imports use URL specifiers (or `jsr:` / `npm:` specifiers) — not `node_modules`.

### Conventions

- One function per directory under `supabase/functions/`.
- Each function has its own `index.ts` as the entry point.
- Environment variables come from `Deno.env.get()`. Set them with `supabase secrets set KEY=value`. Never read from `.env` files inside Edge Functions.
- Functions return `Response` objects. Use proper status codes (`200`, `400`, `500`) — don't return `200` with an error body.

### The generate-embedding function

This function:
1. Receives a JSON body with `applicationId`.
2. Reads the application row (using the service role client).
3. Builds the input text: `${role} at ${company}. ${notes ?? ""}`.
4. Calls Voyage AI's `/v1/embeddings` endpoint with model `voyage-3-lite`.
5. Writes the resulting vector and the source text back to the row.

It is **fire-and-forget**. Failures are logged but don't surface to the user. A nightly retry job (TODO, v2) will pick up rows with null embeddings.

If the function ever needs to be authenticated as the user (rather than service role), that's a different design — flag it before changing.

**This function is a public HTTP endpoint, not just an internal trigger.** It must be protected:

- Verify a shared secret on every request. The pg_net trigger must pass `x-internal-secret: <EDGE_FUNCTION_SECRET>` as a header. The function must check it and return `401` immediately if it's missing or wrong. Set the secret with `supabase secrets set EDGE_FUNCTION_SECRET=<random-hex>` — never hardcode it.
- Validate the request body before doing anything else. `applicationId` must be a non-empty string that matches UUID format. Return `400` for invalid input — don't pass an unvalidated value to a database query.
- Don't return raw error details (stack traces, Postgres errors) in the response body. Log server-side; return a generic message.

### Deploying functions

- `supabase functions deploy <name>` deploys a single function.
- After deploying, verify the function is reachable: `supabase functions invoke <name> --body '{...}'`.
- Logs: `supabase functions logs <name> --tail`.

## Local development

- `supabase start` runs the full stack locally (Postgres, Auth, Studio, Storage). Requires Docker.
- `supabase db reset` drops local DB and re-runs all migrations. Use this whenever migrations change.
- Local URLs are emitted on `start` — typically `http://localhost:54321` for the API and `http://localhost:54323` for Studio.
- Local environment is **not the same as remote.** Don't assume something working locally works in production until pushed.

## Generating types

After every migration, regenerate the TypeScript types:

```bash
supabase gen types typescript --linked > packages/types/src/db.ts
```

The dashboard and extension import from `packages/types`. **Never hand-edit `db.ts`** — it's generated. If you need a type that isn't generated (e.g., a derived shape), put it in a separate file in `packages/types`.

## Common AI mistakes — don't do these

Patterns that go wrong with Postgres, RLS, and Supabase specifically.

### RLS mistakes that expose user data

- **Don't forget `with check`.** A policy with only `using` filters reads but lets users insert rows owned by other users. Always include both unless you specifically want write-only or read-only access.
- **Don't write policies that compare `user_id` to anything but `auth.uid()`.** No session variables, no custom JWT claims, no cookies. `auth.uid()` is the source of truth.
- **Don't disable RLS "temporarily for testing."** Use a service role key in a controlled context if you need to bypass it. Disabling and re-enabling is how data gets exposed.
- **Don't write `security definer` functions** that run RLS-protected queries unless you've thought hard about it. They bypass RLS and run as the function owner.
- **Don't put RLS policies on views.** They don't apply. RLS lives on the underlying tables; views inherit through them when invoked with `security invoker` (the default).

### Migration discipline

- **Don't edit a migration that's been pushed.** Write a new one to undo or alter it.
- **Don't combine schema changes for unrelated features** into one migration. Each migration is one logical change.
- **Don't skip `enable extension` statements** for extensions you depend on (`vector`, `pg_net`). Even if the extension is already enabled in the dashboard UI, the migration should declare it.
- **Don't put data seeding in schema migrations.** Use the seed file (`supabase/seed.sql`) for local-only data.
- **Don't write `drop table`, `truncate`, `delete without where`** in a migration without flagging it loudly. These are destructive and need explicit approval.

### Query patterns that bite

- **Don't call `.single()` on queries that might return zero rows.** It throws. Use `.maybeSingle()` if null is a valid outcome.
- **Don't use `select *` in functions exposed via RPC.** It returns more columns than expected and breaks when the schema changes. Be explicit.
- **Don't use `select *` on tables with a `vector` column** if you don't need the vector. It's large and ships across the wire.
- **Don't write joins that ignore RLS.** RLS applies to each table independently. A join across two tables works only if both tables' RLS policies allow the user to see each row.

### pgvector mistakes

- **Don't mix up the distance operators.** `<=>` is cosine distance, `<->` is L2/euclidean, `<#>` is negative inner product. Using the wrong one changes the ranking and won't error.
- **Don't forget that distance and similarity are inverses.** `1 - distance` for cosine. The closest match has the smallest distance and the largest similarity.
- **Don't query the `embedding` column from the client.** It's a 512-dim float array — large. Always go through an RPC that returns just the IDs and similarity scores.
- **Don't create the IVFFlat index before there's data.** It needs at least some rows to build cluster centroids. Create the index after the first batch of data, or skip the index entirely until you have a few hundred rows.

### Edge Function mistakes

- **Don't import from `node:` specifiers.** Edge Functions run Deno. Use Deno-compatible imports (`https://deno.land/...`, `jsr:`, `npm:`).
- **Don't use `process.env`.** Use `Deno.env.get(...)`.
- **Don't read secrets from a `.env` file** inside an Edge Function. Use `supabase secrets set` and read with `Deno.env.get`.
- **Don't return raw errors to the caller.** Log the full error server-side; return a generic `500` with a non-leaky message.
- **Don't make Edge Functions stateful.** They're stateless and may scale to multiple instances.
- **Don't leave trigger-invoked functions open to unauthenticated HTTP requests.** Even though `generate-embedding` is called by a pg_net trigger, it's reachable by anyone with the URL. Always verify the shared secret header before processing.

### Knowledge cutoff awareness

- Supabase's auth helpers package was renamed: `@supabase/auth-helpers-nextjs` is deprecated, replaced by `@supabase/ssr`.
- `pg_net` and `pg_cron` extensions have evolved — verify the current invocation syntax before generating triggers that use them.
- The Supabase CLI commands have changed: older tutorials use `supabase functions new`, current is the same; older tutorials may reference different login flow. Check `supabase --help` if uncertain.

## Things to never do

- **Never disable RLS on a user-data table**, even temporarily, even "just for testing." Use a service role key in a controlled context if you need to bypass RLS for a one-off task.
- **Never edit a migration that's been pushed to remote.** Write a new one.
- **Never put secrets in migrations** (e.g., as `insert` values). Migrations are committed; secrets are not.
- **Never run destructive SQL on remote without saying it out loud first.** `drop table`, `truncate`, `delete without where`, `alter column type` on a populated column — all of these need explicit confirmation.
- **Never query the `embedding` column directly from the dashboard.** Use the `find_similar_applications` RPC. The column is large and shouldn't be sent over the wire.
- **Never modify a migration after I've approved it without re-approval.** If a push fails and the fix requires editing the migration, stop, show me the error and the proposed change, wait for explicit go-ahead. Edits made between approval and push are not okay even if they're "obviously correct."

## What "done" looks like for a Supabase task

Before saying a migration or function is done:

1. `supabase db reset` runs cleanly with no errors.
2. RLS policies are present on every new user-data table.
3. Types regenerated and committed (`packages/types/src/db.ts` is up to date).
4. The migration tested with at least one insert and one query.
5. If there's a trigger, you've verified it actually fires (check the events table or function logs).
6. For Edge Functions: deployed, and `supabase functions invoke` returns the expected response.

If any of these is unverified, say so.
