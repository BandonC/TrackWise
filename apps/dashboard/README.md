# TrackWise Dashboard

Next.js 16 (App Router) web dashboard for TrackWise — the Kanban board,
analytics, application detail/resume-fit, and settings surfaces. Deploys to
Vercel from `main`.

For product context and architecture see [`../../TrackWise.md`](../../TrackWise.md).
For the rules on working in this app see [`CLAUDE.md`](./CLAUDE.md).

## Getting started

Requires Node 24 (`.nvmrc`) and pnpm 10. From the repo root:

```bash
pnpm install
cp .env.example apps/dashboard/.env.local   # then fill in the Supabase values
pnpm --filter dashboard dev                  # http://localhost:3000
```

Environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`) are documented in
the root `.env.example`. Server-only secrets and Edge Function secrets are
never read here — see the root README's Security section.

## Auth

Google OAuth only (no email/password signup). Unauthenticated users hitting
any `(app)` route are redirected to `/login` by `proxy.ts` (the Next.js 16
rename of `middleware.ts`).
