# TrackWise

The single source of truth for **what TrackWise is** — product framing, architecture, data model, features, build plan, and key decisions. The CLAUDE.md files at the repo root and per-folder are the source of truth for *rules*. This doc is the source of truth for *what's being built*.

When details here conflict with the CLAUDE.md files, flag the conflict — don't silently follow one or the other.

---

## 1. Product

### 1.1 What it is

TrackWise is a job application tracker built around analytics, not logging. The premise is that the value of tracking applications isn't the list itself — it's what the list can teach you about your own search. Response rates, time-to-response distributions, source effectiveness, and semantic clusters within an application history reveal patterns that are otherwise invisible.

Most existing trackers (Huntr, Teal, Simplify) treat the list as the primary artifact and bolt analytics on as an afterthought. TrackWise inverts that: analytics is first-class, the list is supporting infrastructure.

### 1.2 Target user

A student or early-career professional applying to dozens or hundreds of roles across LinkedIn, Indeed, and direct company career pages. They want a fast, low-friction way to capture applications as they go and a clean dashboard to review where they stand and what's working. Solo user, no collaboration features, no team accounts.

### 1.3 Differentiation

Three features distinguish TrackWise from comparable free tools:

- **Analytics-first dashboard.** Response rate, time-to-response, funnel, and source breakdown are the primary view, not buried in settings.
- **Semantic similarity search via pgvector + Voyage AI embeddings.** Surfaces patterns in the kinds of roles a user pursues — "you keep applying to Kubernetes-heavy backend roles" — without manual tagging.
- **Lightweight and no-bloat.** No paid tier nags, no upsells, no gamification. Optional account, fast load, minimal UI.

### 1.4 Default principles for unspecified decisions

When making decisions the rules and architecture don't cover, default to:

- Prioritize analytics over list features.
- Favor lightweight over feature-rich.
- Favor learning-from-data over data-entry tooling.
- Solo-user assumptions are fine; multi-user is explicitly out of scope.

### 1.5 Out of scope (with reasons)

- **Auto-filling job applications.** Simplify owns this niche; reproducing it adds enormous scope for marginal differentiation.
- **Multi-user / team accounts.** Solo tool by design. RLS assumes one user per data row.
- **Mobile apps.** Chrome extension + web dashboard cover the use cases.
- **Resume building, cover letter generation.** Different product.
- **Email integration (Gmail API).** Genuinely useful but adds OAuth scope, parsing complexity, and Chrome Web Store review friction. Flagged for v2.
- **K-means clustering of embeddings.** Cluster-by-response-rate analytics would be the killer feature; deferred to v2 because it adds 5+ hours and the simpler "find similar" UX validates the embedding pipeline first.
- **Browser notifications.** Nice-to-have, low priority.

### 1.6 Goals

- Provide a frictionless way to save job applications directly from major job boards via a Chrome extension.
- Surface meaningful analytics about a user's job search, including response rate, time to first response, conversion funnel by status, and breakdown by source.
- Use semantic embeddings to identify similar applications, helping users recognize patterns in the kinds of roles they pursue and which patterns convert.
- Maintain a strict zero-recurring-cost footprint by leveraging free tiers across all infrastructure components.
- Demonstrate end-to-end full-stack engineering competence suitable for a portfolio: extension development, modern frontend, backend with row-level security, vector search, and analytics.

---

## 2. System overview

### 2.1 High-level architecture

TrackWise consists of three components that share a single Supabase project as their source of truth:

- A Chrome extension (content scripts, background service worker, popup UI) that detects job postings on supported sites and saves them to the database.
- A Next.js web dashboard providing the Kanban board, analytics, and application detail views.
- A Supabase backend exposing Postgres (with the pgvector extension), authentication, row-level security, and Edge Functions for embedding generation.

### 2.2 Component diagram

```
  +---------------------+         +----------------------+
  |  Chrome Extension   |         |  Next.js Dashboard   |
  |  - content scripts  |         |  - Kanban board      |
  |  - background SW    |         |  - Analytics page    |
  |  - popup UI         |         |  - Detail views      |
  +----------+----------+         +-----------+----------+
             |                                |
             |        +----------------+      |
             +------->|    Supabase    |<-----+
                      |  Postgres+Auth |
                      |   + pgvector   |
                      | + Edge Funcs   |
                      +-------+--------+
                              |
                              v
                      +----------------+
                      |  Voyage AI API |
                      |  (embeddings)  |
                      +----------------+
```

### 2.3 Data flow

**Saving an application.** The user clicks an injected button on a supported job posting page. The content script extracts structured data, sends it to the background service worker, which writes to Supabase using the user's session token. A Postgres trigger records a creation event in the events table. A second trigger invokes a Supabase Edge Function asynchronously to generate an embedding via the Voyage AI API and store it back on the row.

**Viewing analytics.** The dashboard queries Postgres views that aggregate applications and events into response rate, funnel, time-to-response, and source breakdown metrics. Recharts renders the result client-side.

**Finding similar applications.** When a user opens an application detail page, the dashboard calls a Postgres function that performs a cosine similarity search using pgvector against the user's other embedded applications and returns the top matches.

---

## 3. Technology stack

### 3.1 Stack summary

| Layer | Technology | Rationale |
|---|---|---|
| Extension | TypeScript + Vite + @crxjs/vite-plugin | Vanilla TS keeps bundle minimal; crxjs handles Manifest V3 build complexity |
| Dashboard framework | Next.js 16 (App Router) + TypeScript | Industry standard React framework; SSR for fast initial load |
| Styling | Tailwind CSS + shadcn/ui | Rapid development with polished default components |
| Charts | Recharts | React-native, sensible defaults, clean output |
| Drag-and-drop | @dnd-kit/core | Modern, accessible, framework-agnostic |
| Database | Supabase Postgres + pgvector | Free tier; relational + vector search in one engine |
| Auth | Supabase Auth | Built-in OAuth, magic link, RLS integration |
| Edge compute | Supabase Edge Functions (Deno) | Server-side embedding generation without separate hosting |
| Embeddings | Voyage AI (voyage-3-lite) | Free tier sufficient; high-quality embeddings |
| Dashboard hosting | Vercel (Hobby tier) | Free, GitHub-integrated, CDN-backed |
| Extension distribution | Chrome Web Store | $5 one-time fee; legitimacy and discoverability |
| Source control | GitHub (public repo) | Portfolio visibility |

### 3.2 Cost

All recurring infrastructure runs on free tiers within the planned usage envelope:

| Service | Tier | Limit | Expected usage |
|---|---|---|---|
| Supabase | Free | 500 MB DB, 5 GB egress, 50K MAU | <10 MB, <100 MB egress, single user |
| Vercel | Hobby | 100 GB bandwidth | <5 GB |
| Voyage AI | Free | 200M tokens/month | <500K tokens |
| Chrome Web Store | One-time $5 | N/A | Single registration |
| GitHub | Free (public repo) | N/A | N/A |

Total cost: $5 one-time, $0/month recurring.

---

## 4. Data model

### 4.1 Schema overview

Two tables form the core of the data model. `applications` holds the canonical state of each saved job. `application_events` provides an append-only audit log used for time-based analytics and historical reconstruction.

### 4.2 Tables

#### applications

```sql
create table applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  location text,
  salary_min int,
  salary_max int,
  source_url text,
  source_site text,         -- 'linkedin' | 'indeed' | 'manual' | etc.
  status text not null default 'applied',
                            -- 'applied' | 'screening' | 'interview' | 'offer' | 'rejected'
  applied_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  notes text,
  embedding vector(512),    -- voyage-3-lite output dimension
  embedding_source text     -- text used to generate the embedding (debugging)
);
```

#### application_events

```sql
create table application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, -- 'created' | 'status_change' | 'note_added'
  from_status text,
  to_status text,
  created_at timestamptz not null default now()
);
```

### 4.3 Row-level security

RLS is enabled on both tables on day one. Without it, any authenticated user can read every other user's data through Supabase's auto-generated REST API. The policies restrict all operations to rows owned by the authenticated user:

```sql
alter table applications enable row level security;
alter table application_events enable row level security;

create policy "users access own applications"
  on applications for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users access own events"
  on application_events for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### 4.4 Triggers

A status-change trigger keeps the events log consistent without coupling event creation to application code:

```sql
create or replace function log_status_change() returns trigger as $$
begin
  if old.status is distinct from new.status then
    insert into application_events
      (application_id, user_id, event_type, from_status, to_status)
    values
      (new.id, new.user_id, 'status_change', old.status, new.status);
  end if;
  new.last_updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger on_status_change
  before update on applications
  for each row execute function log_status_change();
```

A second trigger fires on insert to record a 'created' event and to invoke the embedding generation Edge Function asynchronously via pg_net.

### 4.5 Indexes

- B-tree on `applications(user_id, status)` — supports the dashboard's per-status queries.
- B-tree on `applications(user_id, applied_at desc)` — supports recent-first listing.
- IVFFlat on `applications(embedding) using vector_cosine_ops` — supports similarity search. `lists` is set to 100, appropriate up to a few thousand rows.

---

## 5. Features

### 5.1 Chrome extension

Manifest V3 extension that detects job postings on supported sites, parses them, and saves them to Supabase via a background service worker. Currently supports LinkedIn (`/jobs/*`) and Indeed (`/viewjob*`). Each supported site has its own parser module with multiple fallback selectors. Manual entry is always available as a fallback if parsing fails.

The popup is a minimal interface showing the five most recently saved applications with status pills, a manual Add Job form, and a link to the dashboard. The extension authenticates via `chrome.identity.launchWebAuthFlow` against Supabase's OAuth endpoint. Tokens are stored in `chrome.storage.local`.

Manifest:

```json
{
  "manifest_version": 3,
  "name": "TrackWise",
  "version": "1.0.0",
  "description": "Track job applications and learn from your search.",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://www.linkedin.com/jobs/*",
    "https://www.indeed.com/viewjob*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": [
      "https://www.linkedin.com/jobs/*",
      "https://www.indeed.com/viewjob*"
    ],
    "js": ["content.js"]
  }],
  "action": { "default_popup": "popup.html" }
}
```

### 5.2 Dashboard routing

Next.js App Router with two route groups: `(auth)` for unauthenticated routes and `(app)` for authenticated routes. Middleware enforces authentication on the `(app)` group.

```
app/
  (auth)/
    login/page.tsx
    signup/page.tsx
  (app)/
    page.tsx                     # Kanban board (default landing)
    analytics/page.tsx           # Analytics dashboard
    applications/[id]/page.tsx   # Detail view + similar jobs
    settings/page.tsx
  layout.tsx
  middleware.ts                  # Auth guard
```

### 5.3 Kanban board

Default landing page for authenticated users. Five columns map to the status enum: Applied, Screening, Interview, Offer, Rejected. Each card shows company, role, applied date, and a stale indicator if the application has not been updated in more than seven days.

Drag-and-drop between columns uses @dnd-kit/core. On drop, the card's new status is written to Postgres optimistically. The status-change trigger automatically inserts a row into `application_events`, requiring no client logic.

### 5.4 Analytics page

Four metrics in a single screen, with a date-range filter (last 30 days, 90 days, all time):

| Metric | Visualization | Data source |
|---|---|---|
| Response rate | Stat card with delta vs prior period | `v_response_rate` view |
| Funnel by status | Horizontal bar / funnel chart | Aggregate of `applications.status` |
| Time to first response | Histogram | `v_time_to_response` view |
| Response rate by source | Horizontal bar chart | `v_response_by_source` view |

Postgres views encapsulate the queries and inherit RLS through their underlying tables:

```sql
create view v_response_rate as
select
  user_id,
  count(*) as total,
  count(*) filter (where status != 'applied') as responded,
  count(*) filter (where status != 'applied')::float
    / nullif(count(*), 0) as rate
from applications
group by user_id;
```

```sql
create view v_time_to_response as
select
  a.id,
  a.user_id,
  a.applied_at,
  min(e.created_at) filter (where e.to_status != 'applied')
    as first_response_at,
  extract(epoch from (
    min(e.created_at) filter (where e.to_status != 'applied')
    - a.applied_at
  )) / 86400 as days_to_response
from applications a
left join application_events e on e.application_id = a.id
group by a.id;
```

### 5.5 Application detail view

Full application metadata, an editable notes field, status history derived from `application_events`, and a Similar Applications section at the bottom.

The Similar Applications section calls the `find_similar_applications` RPC and renders the top five matches. Cards above 0.85 similarity are labeled "Very Similar"; 0.70-0.85 are labeled "Similar"; below 0.70 are hidden.

### 5.6 Semantic similarity search

Each application's company, role, and notes are concatenated, embedded via Voyage AI, and stored in the `embedding` column as a 512-dimensional vector. Similarity uses cosine distance via the pgvector `<=>` operator.

**Generation flow** (fire-and-forget):

1. Trigger fires on insert into `applications`.
2. Trigger uses pg_net to invoke the `generate-embedding` Edge Function asynchronously.
3. Edge Function reads the row, calls Voyage AI, writes the vector back.
4. If the call fails, the row is left with a null embedding. A nightly retry job (v2) handles missing embeddings.

**Edge Function:**

```typescript
// supabase/functions/generate-embedding/index.ts
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

serve(async (req) => {
  const { applicationId } = await req.json()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: app } = await supabase
    .from('applications')
    .select('company, role, notes')
    .eq('id', applicationId)
    .single()

  const text = `${app.role} at ${app.company}. ${app.notes ?? ''}`

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('VOYAGE_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input: text, model: 'voyage-3-lite' })
  })

  const { data: [{ embedding }] } = await res.json()

  await supabase
    .from('applications')
    .update({ embedding, embedding_source: text })
    .eq('id', applicationId)

  return new Response('ok')
})
```

**Similarity query** (RPC, RLS-enforced):

```sql
create or replace function find_similar_applications(
  target_id uuid,
  match_count int default 5
)
returns table (
  id uuid, company text, role text, similarity float
)
language sql security invoker
as $$
  select
    a.id, a.company, a.role,
    1 - (a.embedding <=> target.embedding) as similarity
  from applications a
  cross join (
    select embedding from applications
    where id = target_id and user_id = auth.uid()
  ) target
  where a.id != target_id
    and a.user_id = auth.uid()
    and a.embedding is not null
  order by a.embedding <=> target.embedding
  limit match_count;
$$;
```

---

## 6. Security

### 6.1 Authentication

All authenticated requests carry a Supabase-issued JWT. The dashboard uses `@supabase/ssr` for cookie-based session management. The extension uses `chrome.identity.launchWebAuthFlow` and stores tokens in `chrome.storage.local`. Tokens are scoped to the extension's origin and not accessible from other extensions or web pages.

### 6.2 Row-level security

RLS is the primary mechanism preventing cross-user data exposure. Every table, view, and RPC enforces `user_id = auth.uid()`. Policies are tested by attempting cross-user reads with a second test account during development.

### 6.3 Secret management

- Voyage API key: stored as a Supabase Edge Function secret, never in client code.
- Supabase service role key: used only inside Edge Functions, never exposed to clients.
- Supabase anon (publishable) key: safe to ship in extension and dashboard because RLS gates everything.
- No secrets committed to the repository. `.env.local` files are gitignored.

### 6.4 Extension permissions

The manifest requests only `storage` and `activeTab`, plus host permissions limited to LinkedIn job pages and Indeed view-job pages. No `<all_urls>`, no `tabs`, no broad permissions. This minimizes the user-facing install warning and Chrome Web Store review friction.

### 6.5 Privacy policy

A privacy policy hosted at `/privacy` on the dashboard, linked from the Chrome Web Store listing. States what data is collected (job information saved by the user, email for authentication), where it is stored (Supabase), that it is not sold or shared, and how users can delete their account and data.

---

## 7. Deployment

### 7.1 Repository structure

pnpm monorepo:

```
trackwise/
  apps/
    dashboard/
    extension/
  packages/
    types/
    db/
  supabase/
    functions/
      generate-embedding/
    migrations/
  CLAUDE.md
  TrackWise.md
  README.md
```

### 7.2 Dashboard

Deploys to Vercel via GitHub integration. Pushes to `main` trigger production deploys. Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are set in the Vercel dashboard.

### 7.3 Extension

Built locally with `pnpm build`, output to `dist/`. Contents zipped and uploaded to the Chrome Web Store Developer Dashboard. Initial review: 3–7 days. Updates: 1–3 days.

During development: load unpacked from `chrome://extensions` with Developer Mode enabled. Rebuild → refresh extension card → refresh test page.

### 7.4 Database migrations

Managed via the Supabase CLI. Each schema change is a numbered SQL file in `supabase/migrations/`. Migrations are tracked in version control and reviewed alongside code.

### 7.5 Keep-alive

Supabase pauses free-tier projects after seven days of inactivity. A weekly GitHub Action runs a no-op query to keep the project warm:

```yaml
# .github/workflows/keep-alive.yml
name: Keep Supabase Alive
on:
  schedule:
    - cron: '0 12 * * 1'  # Mondays at noon UTC
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST "$SUPABASE_URL/rest/v1/rpc/ping" \
            -H "apikey: $SUPABASE_ANON_KEY"
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

---

## 8. Build roadmap

### 8.1 Phased plan

The build order prioritizes a working end-to-end path before depth in any single component.

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Vertical slice | Supabase project, schema with RLS, Next.js skeleton with auth and table view of applications |
| 2 | Extension MVP | Vite scaffold, popup with hardcoded save button writing to Supabase, end-to-end test |
| 3 | Real save flow | LinkedIn parser, Indeed parser, content script with injected button, extension auth |
| 4 | Dashboard UX | Kanban board with drag-and-drop, status-change trigger wired up, manual add form |
| 5 | Analytics | Postgres views, /analytics route with four charts, date filter |
| 6 | Semantic search | pgvector setup, Edge Function, embedding trigger, similar applications UI |
| 7 | Polish + ship | Privacy policy, README with screenshots, demo gif, Chrome Web Store submission |

Total estimated effort: 25–35 hours of focused work.

### 8.2 V2 (deliberately deferred)

- K-means clustering on embeddings to identify groups of similar applications, with response rate per cluster.
- Gmail integration via OAuth and the Gmail API to auto-detect status changes from incoming emails.
- Support for additional job boards: Wellfound, Y Combinator's Work at a Startup, Glassdoor, university career portals.
- Browser notifications for stale applications.
- Resume version tagging.
- CSV export.

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LinkedIn DOM changes break parser | High | Medium | Multiple fallback selectors; manual entry always available; parser fails gracefully |
| Chrome Web Store review rejection | Medium | Low | Narrow permissions; specific permission justifications; privacy policy in place before submission |
| Supabase project pausing | Medium | Medium | Weekly GitHub Action ping; documented wake-up steps in README |
| Voyage API rate limits or downtime | Low | Low | Embeddings are fire-and-forget; nightly retry job for failed embeddings |
| Manifest V3 service worker termination losing state | High | Low | All state persisted to chrome.storage.local; worker is stateless |
| RLS policy misconfiguration exposing data | Low | High | Tested with second account during development; policies reviewed before launch |

---

## 10. Notable decisions

Lightweight decision log. Each entry is the choice made and the reason in one or two lines. When a decision changes, update the entry — git history preserves the prior version.

- **Voyage AI over OpenAI for embeddings.** Voyage's free tier is more generous; voyage-3-lite at 512 dimensions is cheaper to store than OpenAI's 1536.
- **`@supabase/ssr` over `@supabase/auth-helpers-nextjs`.** auth-helpers was deprecated in 2024.
- **Vanilla TypeScript in the extension, not React.** Bundle size matters for content scripts; Manifest V3 service workers don't need a UI framework.
- **Postgres triggers for status-change logging, not client code.** Keeps the event log consistent regardless of who or what updates `status`. Client never writes to `application_events` for status changes.
- **pgvector with IVFFlat instead of HNSW.** IVFFlat is fine up to a few thousand rows; HNSW is overkill for v1.
- **Embeddings are fire-and-forget.** Triggered async via pg_net; saves don't block on embedding generation. Failures leave the row with a null embedding and get retried later.
- **Server actions over API routes** in the dashboard. Simpler, progressive enhancement built in. API routes only when there's a specific reason (e.g., third-party callbacks).
- **Three Supabase clients** in the dashboard (server, browser, middleware). Each serves a specific context; mixing them silently breaks auth.
- **Supabase over Firebase.** Postgres is more resume-friendly than Firestore; Supabase reduces vendor lock-in.
- **Embedding dimension locked to 512** (voyage-3-lite). Changing models requires regenerating all embeddings — flagged as a careful migration if it ever happens.
- **Chrome extension auth via `chrome.identity.launchWebAuthFlow`**, not the Supabase SDK's default browser flow. The default flow doesn't work cleanly in an extension popup context.
- **Supabase pausing handled via GitHub Action**, not manual dashboard pings. Visible in the repo; serves as a small DevOps demonstration.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| Manifest V3 | Current Chrome extension platform version. Required for new submissions; uses service workers instead of persistent background pages. |
| pgvector | PostgreSQL extension for vector data and similarity search (e.g., `<=>` for cosine distance). |
| RLS | Row-Level Security. PostgreSQL feature that filters rows based on the session's identity. |
| IVFFlat | Approximate nearest-neighbor index in pgvector. Partitions vectors into lists for faster search. |
| Edge Function | Deno-based serverless function hosted by Supabase. |
| RPC | Remote Procedure Call. A Postgres function exposed through Supabase's auto-generated REST API. |

---

## 12. References

- Chrome Extensions documentation: https://developer.chrome.com/docs/extensions
- Supabase documentation: https://supabase.com/docs
- pgvector repository: https://github.com/pgvector/pgvector
- Voyage AI documentation: https://docs.voyageai.com
- Next.js App Router: https://nextjs.org/docs/app
