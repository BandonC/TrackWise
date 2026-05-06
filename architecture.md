# TrackWise — Architecture

This document describes what TrackWise is being built as: components, data model, security, deployment, and the build sequence. The CLAUDE.md files at the repo root and per-folder are the source of truth for *rules*. This document is the source of truth for *what's being built*.

When details here conflict with the CLAUDE.md files, flag the conflict — don't silently follow one or the other.

---

## 1. Project Context

### 1.1 Background

Job seekers, particularly students and early-career professionals, frequently apply to dozens or hundreds of positions across multiple platforms. Tracking the status, source, and outcome of each application becomes difficult without dedicated tooling. While commercial offerings such as Huntr, Teal, and Simplify exist, they tend toward feature bloat, push paid tiers aggressively, and treat the application list as the primary artifact rather than a means to learn from one's search.

TrackWise is a lightweight, full-stack job application tracker built around a core insight: the value of tracking applications is not the list itself, but what the list can teach you about your own search. Response rates, time-to-response distributions, source effectiveness, and semantic clusters within an application history reveal patterns that are otherwise invisible. TrackWise treats analytics as a first-class concern rather than an afterthought.

### 1.2 Goals

- Provide a frictionless way to save job applications directly from major job boards via a Chrome extension.
- Surface meaningful analytics about a user's job search, including response rate, time to first response, conversion funnel by status, and breakdown by source.
- Use semantic embeddings to identify similar applications, helping users recognize patterns in the kinds of roles they pursue and which patterns convert.
- Maintain a strict zero-recurring-cost footprint by leveraging free tiers across all infrastructure components.
- Demonstrate end-to-end full-stack engineering competence suitable for a portfolio: extension development, modern frontend, backend with row-level security, vector search, and analytics.

### 1.3 Non-Goals

- Auto-filling job applications. This is Simplify's core feature and is out of scope.
- Multi-user collaboration, team accounts, or recruiter-facing features.
- Mobile applications. The Chrome extension and web dashboard are the only clients.
- Integrations with applicant tracking systems (ATS) on the employer side.
- Resume building, cover letter generation, or interview preparation tooling.

### 1.4 Target User

The primary user is a student or early-career professional actively applying to roles, typically across LinkedIn, Indeed, niche job boards, and direct company career pages. They want a fast, low-friction way to capture applications as they apply, and a clean dashboard to review where they stand and what is working.

### 1.5 Differentiation

Three features distinguish TrackWise from comparable free tools:

- **Analytics-first dashboard.** Response rate, time-to-response, funnel, and source breakdown are presented as the primary view, not buried in a settings page.
- **Semantic similarity search via pgvector and Voyage AI embeddings.** Users can view applications similar to any given role, surfacing patterns in the types of jobs they pursue.
- **Lightweight, no-bloat experience.** No paid tier prompts, no gamification, no upsells. Optional account, fast load, minimal UI.

---

## 2. System Overview

### 2.1 High-Level Architecture

TrackWise consists of three components that share a single Supabase project as their source of truth:

- A Chrome extension (content scripts, background service worker, popup UI) that detects job postings on supported sites and saves them to the database.
- A Next.js web dashboard providing the Kanban board, analytics, and application detail views.
- A Supabase backend exposing Postgres (with the pgvector extension), authentication, row-level security, and Edge Functions for embedding generation.

### 2.2 Component Diagram

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

### 2.3 Data Flow Summary

**Saving an application:** The user clicks an injected button on a supported job posting page. The content script extracts structured data, sends it to the background service worker, which writes to Supabase using the user's session token. A Postgres trigger records a creation event in the events table. A second trigger invokes a Supabase Edge Function asynchronously to generate an embedding via the Voyage AI API and store it back on the row.

**Viewing analytics:** The dashboard queries Postgres views that aggregate applications and events into response rate, funnel, time-to-response, and source breakdown metrics. Recharts renders the result client-side.

**Finding similar applications:** When a user opens an application detail page, the dashboard calls a Postgres function that performs a cosine similarity search using pgvector against the user's other embedded applications and returns the top matches.

---

## 3. Technology Stack

### 3.1 Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Extension | TypeScript + Vite + @crxjs/vite-plugin | Vanilla TS keeps bundle minimal; crxjs handles Manifest V3 build complexity |
| Dashboard framework | Next.js 14 (App Router) + TypeScript | Industry standard React framework; SSR for fast initial load |
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

### 3.2 Cost Breakdown

All recurring infrastructure runs on free tiers within the planned usage envelope:

| Service | Tier | Limit | Expected Usage |
|---|---|---|---|
| Supabase | Free | 500 MB DB, 5 GB egress, 50K MAU | <10 MB, <100 MB egress, single user |
| Vercel | Hobby | 100 GB bandwidth | <5 GB |
| Voyage AI | Free | 200M tokens/month | <500K tokens |
| Chrome Web Store | One-time $5 | N/A | Single registration |
| GitHub | Free (public repo) | N/A | N/A |

Total cost: $5 one-time, $0/month recurring.

### 3.3 Rejected Alternatives

- **Firebase + Firestore:** Postgres is more resume-friendly than Firestore, and Supabase reduces vendor lock-in.
- **Custom Express + self-hosted Postgres:** adds 5+ hours of setup, deployment, and migration management for no architectural benefit at this scale.
- **Pure local-first (IndexedDB only):** eliminates the full-stack story that justifies the project's portfolio value.
- **OpenAI text-embedding-3-small:** technically a viable alternative to Voyage; rejected only because Voyage's free tier is more generous and the integration story is slightly more interesting in interviews.
- **D3.js for charts:** significantly more powerful than Recharts but the additional flexibility is unused at this scope; not worth the development time.

---

## 4. Data Model

### 4.1 Schema Overview

Two tables form the core of the data model. Applications hold the canonical state of each saved job. Application events provide an append-only audit log used for time-based analytics and historical reconstruction.

### 4.2 Tables

#### 4.2.1 applications

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

#### 4.2.2 application_events

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

### 4.3 Row-Level Security

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
- IVFFlat on `applications(embedding) using vector_cosine_ops` — supports similarity search. The `lists` parameter is set to 100, appropriate up to a few thousand rows.

---

## 5. Chrome Extension Architecture

### 5.1 Manifest

The extension uses Manifest V3, the only supported manifest version for new Chrome Web Store submissions. Permissions are scoped narrowly to ease the review process and minimize the warning shown to users at install time:

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

### 5.2 Component Responsibilities

#### Content Scripts

Content scripts run in the context of supported job pages. Their responsibilities:

- Detect that the current page is a job posting (URL pattern + DOM heuristics).
- Inject a small "Save to TrackWise" button into the page UI in a stable location.
- On click, parse company, role, location, salary range, and full job description.
- Send the parsed payload to the background service worker via runtime messaging.

Each supported site has its own parser module to isolate site-specific selector logic. Parsers implement a common interface and use multiple fallback selectors to remain resilient against minor DOM changes. If parsing fails, the button still allows the user to save with manual entry rather than crashing.

#### Background Service Worker

The service worker is the only component that holds the Supabase session and writes to the database. Centralizing this responsibility:

- Prevents content scripts from needing direct database credentials.
- Allows session refresh logic to live in one place.
- Enables future features such as background sync without changing content scripts.

Because Manifest V3 service workers can be terminated at any time, all state is persisted to `chrome.storage.local` rather than worker memory. The worker re-hydrates state on each invocation.

#### Popup

The popup is a minimal interface that opens when the user clicks the extension icon. It shows the five most recently saved applications with status pills, a manual "Add Job" form for unsupported sites, and a link to open the dashboard. The popup is intentionally lightweight; the dashboard is the primary surface for managing applications.

### 5.3 Authentication Flow

The extension authenticates against Supabase using the OAuth flow with `chrome.identity.launchWebAuthFlow`. On first use, the popup prompts the user to sign in. The flow:

1. Popup invokes `chrome.identity.launchWebAuthFlow`, redirecting to the Supabase OAuth endpoint.
2. User completes authentication (Google OAuth is the recommended provider for low friction).
3. Supabase redirects back to the extension's `chromiumapp.org` redirect URL with a session token.
4. The token is stored in `chrome.storage.local`. The background worker reads it for all subsequent database calls.
5. Refresh tokens are used to silently obtain new access tokens before expiry.

---

## 6. Dashboard Architecture

### 6.1 Routing Structure

The dashboard uses Next.js App Router with two route groups: `(auth)` for unauthenticated routes and `(app)` for authenticated routes. A middleware enforces authentication on the `(app)` group.

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

### 6.2 Kanban Board

The Kanban board is the default landing page for authenticated users. Five columns correspond to the status enum: Applied, Screening, Interview, Offer, Rejected. Each column lists application cards showing company, role, applied date, and a stale indicator if the application has not been updated in more than seven days.

Drag-and-drop between columns uses `@dnd-kit/core`. On drop, the card's new status is written to Postgres via Supabase. The status-change trigger automatically inserts a row into `application_events`, requiring no additional client logic.

### 6.3 Analytics Page

The analytics page presents four metrics in a single screen, with a date-range filter in the top-right corner (last 30 days, 90 days, all time).

| Metric | Visualization | Data Source |
|---|---|---|
| Response rate | Stat card with delta vs prior period | `v_response_rate` view |
| Funnel by status | Horizontal bar / funnel chart | Aggregate of `applications.status` |
| Time to first response | Histogram | `v_time_to_response` view |
| Response rate by source | Horizontal bar chart | `v_response_by_source` view |

### 6.4 Application Detail View

The detail page shows full application metadata, an editable notes field, the status history derived from `application_events`, and a "Similar Applications" section at the bottom. The similar applications section calls the `find_similar_applications` RPC and renders the top five matches as horizontal cards with similarity scores. Cards above 0.85 similarity are labeled "Very Similar"; 0.70-0.85 are labeled "Similar"; below 0.70 are hidden.

### 6.5 Postgres Views for Analytics

Analytics queries are encapsulated in Postgres views, allowing the client to treat them as read-only tables and benefiting from Supabase's auto-generated REST API. Views automatically respect RLS through their underlying tables.

```sql
-- Response rate per user
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
-- Time to first response per application (in days)
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

---

## 7. Semantic Search Subsystem

### 7.1 Overview

TrackWise uses vector embeddings to enable semantic similarity search across a user's applications. Each application's company, role, and notes are concatenated into an input string, embedded via the Voyage AI API, and stored in the `embedding` column as a 512-dimensional vector. Similarity is computed using cosine distance via the pgvector `<=>` operator.

### 7.2 Embedding Generation Flow

- On insert into `applications`, a Postgres trigger uses the pg_net extension to invoke a Supabase Edge Function asynchronously.
- The Edge Function reads the row, constructs the input string, calls the Voyage AI embeddings endpoint with the `voyage-3-lite` model, and writes the resulting vector back to the row.
- Embedding generation is fire-and-forget from the user's perspective. Saves are not blocked on the embedding completing.
- If the API call fails, the row is left with a null embedding. A nightly retry job (Supabase scheduled function) processes any rows missing embeddings.

### 7.3 Edge Function

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

### 7.4 Similarity Query

A Postgres function exposed via the auto-generated REST API performs the similarity search. The function uses `auth.uid()` so RLS is enforced even though the query touches multiple rows of the applications table:

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

## 8. Security Considerations

### 8.1 Authentication

All authenticated requests carry a Supabase-issued JWT. The dashboard uses the standard Supabase Auth helpers for Next.js. The extension uses `chrome.identity.launchWebAuthFlow` with the Supabase OAuth endpoint and stores tokens in `chrome.storage.local`. Tokens are scoped to the extension's origin and not accessible from other extensions or web pages.

### 8.2 Row-Level Security

RLS is the primary mechanism preventing cross-user data exposure. Every table, view, and RPC enforces `user_id = auth.uid()`. RLS policies are tested by attempting cross-user reads with a second test account during development.

### 8.3 Secret Management

- The Voyage API key is stored only as an environment variable in Supabase Edge Functions, never in client code.
- The Supabase service role key is used only inside Edge Functions and never exposed to clients.
- The Supabase anon (publishable) key is safe to ship in both extension and dashboard because all access is gated by RLS.
- No secrets are committed to the repository. `.env.local` files are gitignored, and CI deploys read from Vercel and Supabase environment variables.

### 8.4 Extension Permission Scoping

The manifest requests only `storage` and `activeTab` permissions, plus host permissions limited to the supported job board URLs. The extension does not request `<all_urls>`, `tabs`, or any broad permission. This minimizes both the user-facing install warning and the Chrome Web Store review friction.

### 8.5 Privacy Policy

A privacy policy is hosted at `/privacy` on the dashboard and linked from the Chrome Web Store listing. It states what data is collected (job information saved by the user, email for authentication), where it is stored (Supabase), that it is not sold or shared with third parties, and how users can delete their account and data.

---

## 9. Deployment and Operations

### 9.1 Repository Structure

The project is organized as a monorepo with a shared types package:

```
trackwise/
  apps/
    dashboard/        # Next.js dashboard
    extension/        # Chrome extension
  packages/
    types/            # Shared TypeScript types
    db/               # Supabase migrations and seed data
  supabase/
    functions/
      generate-embedding/
    migrations/
  package.json
```

### 9.2 Dashboard Deployment

The dashboard deploys to Vercel. The Vercel project is connected to the GitHub repository; pushes to `main` trigger production deploys, pushes to other branches generate preview deploys. Environment variables (Supabase URL and anon key) are set via the Vercel dashboard.

### 9.3 Extension Deployment

The extension is built locally with `pnpm build`, producing a `dist/` directory. The contents are zipped and uploaded to the Chrome Web Store Developer Dashboard. Initial review takes three to seven days; subsequent updates typically clear in one to three days.

During development, the extension is loaded unpacked from `chrome://extensions` with Developer Mode enabled. The dev workflow is: rebuild, click the refresh icon on the extension card, and refresh any open tab being tested.

### 9.4 Database Migrations

Migrations are managed via the Supabase CLI. Each schema change is captured as a numbered SQL file in `supabase/migrations/`. The CLI is run locally to apply migrations to the production project. Migrations are tracked in version control and reviewed alongside code changes.

### 9.5 Keeping the Free Tier Project Awake

Supabase pauses free-tier projects after seven days of inactivity. To prevent the dashboard appearing offline to a portfolio visitor, a GitHub Action runs weekly and executes a no-op query against the database. This costs nothing, is visible in the repository, and serves as a small DevOps demonstration.

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

## 10. Build Roadmap

### 10.1 Phased Plan

The build order prioritizes a working end-to-end path before depth in any single component. This produces a working artifact early and avoids investing in features that depend on infrastructure not yet validated.

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Vertical slice | Supabase project, schema with RLS, Next.js skeleton with auth and table view of applications |
| 2 | Extension MVP | Vite scaffold, popup with hardcoded save button writing to Supabase, end-to-end test |
| 3 | Real save flow | LinkedIn parser, Indeed parser, content script with injected button, extension auth |
| 4 | Dashboard UX | Kanban board with drag-and-drop, status-change trigger wired up, manual add form |
| 5 | Analytics | Postgres views, /analytics route with four charts, date filter |
| 6 | Semantic search | pgvector setup, Edge Function, embedding trigger, similar applications UI |
| 7 | Polish + ship | Privacy policy, README with screenshots, demo gif, Chrome Web Store submission |

### 10.2 Time Estimate

Total estimated effort: 25 to 35 hours of focused work. The range reflects variability in extension development experience and the unpredictability of Chrome Web Store review feedback.

### 10.3 Future Work (V2)

Items deliberately deferred from V1 but worth flagging on the project roadmap:

- K-means clustering on embeddings to identify groups of similar applications, with response rate per cluster. Reveals which kinds of roles are converting.
- Gmail integration via OAuth and the Gmail API to auto-detect status changes from incoming emails (acknowledgments, interview invites, rejections).
- Support for additional job boards: Wellfound, Y Combinator's Work at a Startup, Glassdoor, university career portals.
- Browser notifications for stale applications (no update in N days).
- Resume version tagging, allowing users to attribute response rate to specific resume variants.
- CSV export of all data for users who want to leave or analyze elsewhere.

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LinkedIn DOM changes break parser | High | Medium | Multiple fallback selectors; manual entry path always available; parser fails gracefully without crashing the extension |
| Chrome Web Store review rejection | Medium | Low | Narrow permissions; specific permission justifications; privacy policy in place before submission |
| Supabase project pausing | Medium | Medium | Weekly GitHub Action ping; documented wake-up steps in README |
| Voyage API rate limits or downtime | Low | Low | Embeddings are fire-and-forget; nightly retry job for failed embeddings |
| Manifest V3 service worker termination losing state | High | Low | All state persisted to chrome.storage.local; worker designed to be stateless |
| RLS policy misconfiguration exposing data | Low | High | Tested with second account during development; policies reviewed before launch |

---

## 12. Glossary

| Term | Meaning |
|---|---|
| Manifest V3 | The current Chrome extension platform version. Required for new submissions; introduces service workers in place of persistent background pages. |
| pgvector | PostgreSQL extension that adds a vector data type and similarity search operators (e.g., `<=>` for cosine distance). |
| RLS | Row-Level Security. PostgreSQL feature that filters rows visible to a query based on the current session's identity. |
| IVFFlat | An approximate nearest-neighbor index type in pgvector that partitions vectors into lists for faster similarity search. |
| Edge Function | A Deno-based serverless function hosted by Supabase, used here for embedding generation. |
| RPC | Remote Procedure Call. In Supabase, a Postgres function exposed through the auto-generated REST API. |

---

## 13. References

- Chrome Extensions documentation: https://developer.chrome.com/docs/extensions
- Supabase documentation: https://supabase.com/docs
- pgvector repository: https://github.com/pgvector/pgvector
- Voyage AI documentation: https://docs.voyageai.com
- Next.js App Router: https://nextjs.org/docs/app
