# TrackWise Dashboard

Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui. The web-facing surface of TrackWise. Read [the root CLAUDE.md](../../CLAUDE.md) first — this file only adds dashboard-specific rules.

## Stack (locked)

- Next.js 14, App Router, TypeScript strict mode
- Tailwind CSS + shadcn/ui (components installed via `npx shadcn@latest add`)
- Recharts for analytics charts
- @dnd-kit/core for the Kanban drag-and-drop
- @supabase/supabase-js + @supabase/ssr for client + server access

Don't propose alternatives to any of these without raising it as a separate conversation.

## Things I need to fill in for this app

- `apps/dashboard/.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- A Vercel project linked to the GitHub repo (the dashboard deploys from `main`)
- The production URL (once deployed) for setting Supabase auth redirect URLs

If any of these are missing when you need them, ask.

## Routing structure

```
app/
  (auth)/
    login/page.tsx
    signup/page.tsx
  (app)/                     # Auth-guarded by middleware.
    page.tsx                 # Kanban board, default landing.
    analytics/page.tsx
    applications/[id]/page.tsx
    settings/page.tsx
  layout.tsx
  middleware.ts              # Redirects unauthenticated users from (app) to /login.
```

Route groups (`(auth)`, `(app)`) are for organization, not URL segments. Don't change them without asking.

## Server vs client components

- **Server components by default.** Only mark `"use client"` when the component genuinely needs interactivity, browser APIs, or hooks.
- Data fetching from Supabase runs on the server when possible. Pass data down to client components as props.
- The Kanban board, analytics charts, and any drag/drop or form interaction will need client components. The page shell, headers, and read-only sections should stay server-side.

## Supabase client setup

There are **three** clients, each used in different places. Don't mix them up.

- **Server client** (`lib/supabase/server.ts`) — use in server components, route handlers, server actions. Reads cookies for the user's session.
- **Browser client** (`lib/supabase/client.ts`) — use in client components.
- **Middleware client** (`lib/supabase/middleware.ts`) — use only inside `middleware.ts` for the auth guard. Refreshes the session cookie.

Both the server and middleware clients use `@supabase/ssr`. If you reach for `createClient` from `@supabase/supabase-js` directly outside of those three files, stop and ask.

## React rules

- Functional components with hooks. No class components.
- **Don't reach for `useEffect` by default.** If something can be derived from props/state, derive it. If it can be fetched server-side, fetch it server-side.
- **Don't add `useMemo`/`useCallback` unless there's a measured perf issue.** Premature memoization is noise.
- Don't add defensive null checks for values that can't be null based on the types. Trust the type system.

## Forms and validation

- Validate on the server, always. Client validation is UX, not security.
- Use `zod` for schemas. The same schema can be shared between server and client when sensible.
- Forms use server actions where possible. Don't introduce a separate form library unless I approve it.

## Security

- **Never use `dangerouslySetInnerHTML`** for any field that originated from extension-parsed job listings (title, company, description, notes). That content comes from third-party DOM and may contain injected markup. React's default text rendering is safe; `dangerouslySetInnerHTML` is not.
- **Add `import "server-only"` at the top of any file that reads `SUPABASE_SERVICE_ROLE_KEY` or other server-side secrets.** This causes a build error if the file is accidentally imported from a client component, preventing secrets from leaking into the browser bundle.

## Styling rules

- Tailwind utility classes. Don't generate giant inline `style` objects.
- Don't introduce new design tokens or color values. Use what's in `tailwind.config.ts` and shadcn's CSS variables.
- shadcn components are added with `npx shadcn@latest add <component>` and live in `components/ui/`. Don't hand-roll a button if shadcn has one.
- Dark mode: use shadcn's `next-themes` setup. Don't write custom dark mode logic.

## Data conventions

- Database types live in `packages/types` and are generated, not hand-written. Run `supabase gen types typescript --linked > packages/types/src/db.ts` after every migration.
- Application data is fetched through Supabase, never through a custom API route unless there's a specific reason (e.g., calling Voyage server-side).
- Postgres views (`v_response_rate`, `v_time_to_response`, `v_response_by_source`) are the source of truth for analytics. Don't recompute these on the client.
- Similarity search goes through the `find_similar_applications` RPC. Don't query the embedding column directly from the client.

## Charts (Recharts)

- One chart per concept. The analytics page has four charts; don't merge them.
- Use shadcn's chart wrapper if available (`components/ui/chart.tsx`) for consistent theming.
- Always handle the empty state. A user with zero applications should see "No data yet" not a broken chart.

## Drag-and-drop (Kanban)

- @dnd-kit/core with `DndContext` at the page level.
- The drop handler updates `status` in Postgres optimistically — set local state first, then write. Roll back on error.
- The status-change Postgres trigger writes to `application_events` automatically. **Don't write events from the client.** If you find yourself wanting to, the trigger is broken and we should fix it, not work around it.

## Performance / bundle

- The dashboard isn't bundle-critical (unlike the extension), but don't import giant libraries for one helper. `date-fns` is fine; importing `lodash` to use one function isn't.
- Server components don't ship JS to the client. Use that.
- No client-side data fetching libraries (no SWR, no TanStack Query) unless I approve it. Server components + server actions handle most cases.

## Common AI mistakes — don't do these

Patterns I've seen go wrong specifically with Next.js dashboards. Read before writing code.

### Server vs client confusion

- **Don't mark a component `"use client"` because something deep inside it is interactive.** Push the `"use client"` boundary as far down the tree as possible. The page shell stays server-side; only the interactive leaf goes client.
- **Don't import a server-only function into a client component** and then wonder why the build fails. Server actions are imported, not the data-fetching helper itself.
- **Don't use `useEffect` to fetch initial data.** If a server component can fetch it, fetch it there and pass it as props. `useEffect`-on-mount data fetching is a smell in App Router.
- **Don't add `"use client"` to a layout** unless the entire layout truly needs to be client. Layouts are usually server components.

### Supabase client misuse

- **Don't import the browser client (`lib/supabase/client.ts`) in server components.** It won't have the user's session and queries will silently return empty.
- **Don't import the server client in client components.** Browser builds will fail.
- **Don't call `createClient` from `@supabase/supabase-js` directly** outside the three files in `lib/supabase/`. Use the existing helpers — they handle cookies and sessions correctly.
- **Don't call `.single()` on a query that might return zero rows** — it throws. Use `.maybeSingle()` when null is a valid outcome.

### State management

- **Don't put server-derived data in `useState`.** Pass it as a prop. `useState` is for state that changes on the client.
- **Don't introduce Zustand, Redux, Jotai, or any state library.** This project doesn't need one. If you think it does, raise it as a separate conversation.
- **Don't use `useEffect` to keep two pieces of state in sync.** Derive one from the other.

### Forms

- **Don't use `<form>` with a custom `onSubmit`** when a server action would do. Server actions handle progressive enhancement and you don't have to write a fetch call.
- **Don't validate only on the client.** Server validation is required; client validation is optional UX.
- **Don't introduce React Hook Form** unless I ask. Server actions + zod cover most cases.

### Styling

- **Don't use arbitrary Tailwind values** like `text-[#1a2b3c]` or `w-[437px]`. Use design tokens. If a token is missing, ask.
- **Don't write inline `style={{ }}` objects** for anything that could be a Tailwind class.
- **Don't generate elaborate CSS-in-JS solutions.** Tailwind covers everything we need.
- **Don't reach for `!important`** to override styles. If a class isn't winning, the cascade is wrong.

### Routing

- **Don't put auth checks in pages.** The middleware handles it for the `(app)` group. Pages can assume the user is authenticated.
- **Don't hardcode `localhost:3000`** in fetch calls or links. Use relative URLs or read from `NEXT_PUBLIC_SITE_URL` (and add it to `.env.example` if needed).
- **Don't use `next/link` with `legacyBehavior`** — that's gone. Just `<Link href="...">text</Link>`.

### Knowledge cutoff awareness

- `@supabase/auth-helpers-nextjs` is **deprecated**. Use `@supabase/ssr`. If a tutorial uses `auth-helpers`, it's outdated.
- Next.js App Router stabilized in 14. Patterns from Pages Router (`getServerSideProps`, `_app.tsx`, `_document.tsx`) **do not apply** here.
- shadcn moved from `npx shadcn-ui@latest` to `npx shadcn@latest`. The old command still partially works but is deprecated.

## What "done" looks like for a dashboard task

Before saying a feature is done:

1. The page renders without console errors in dev.
2. The empty state works (no applications, no events, etc.).
3. The loading state works (data is still fetching).
4. RLS is verified — the data shown actually belongs to the logged-in user. Test by logging in as a second account if there's any doubt.
5. The TypeScript build passes with no `any` and no `@ts-ignore`.
6. Tailwind classes don't include arbitrary values like `text-[#1a2b3c]` — use design tokens.
7. No leftover `console.log` statements.

If you can't tick all seven, say what's missing. Don't claim "done" loosely.
