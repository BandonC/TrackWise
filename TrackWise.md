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
| Embeddings | Voyage AI (voyage-3) | Free tier sufficient; high-quality embeddings |
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
  -- JD body captured by the extension parsers at save time
  -- (PR-D1). Distinct from notes (which stays for user-authored
  -- commentary). Embedding source concatenates this in.
  job_description text,
  embedding vector(1024),   -- voyage-3 output dimension
  embedding_source text,    -- text used to generate the embedding (debugging)
  -- Resume-fit cache (PR-C2). Populated by the dashboard server
  -- component on first detail-page view; invalidated row-locally
  -- when applications.embedding changes (notes/role/company edit).
  -- See section 5.6.
  resume_fit_similarity float,
  resume_fit_section_label text,
  resume_fit_computed_at timestamptz
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

#### resumes

Per-user resume store. Exactly one row per user is flagged `is_active`. Multiple rows allowed for v2's version-tagging story (§8.2); v1 surfaces only the active one. The `embedding` column originally held a single resume-wide vector; **removed in PR-C2** (2026-05-19) — chunks are now the source of truth for fit scoring. `embedding_source` stays as the marker the backfill script (`scripts/backfill-embeddings.mjs --all`) keys off.

```sql
create table resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  embedding_source text     -- marker: 'voyage-3:' (legacy) | 'voyage-3-chunked:' (PR-C2)
);
```

#### resume_chunks

Section-level pieces of a resume. One row per chunk: SKILLS / EDUCATION / SUMMARY as one each, one chunk per project under PROJECTS, one chunk per role under EXPERIENCE. Splitting is multi-tier (header detection → blank-line item split → merge-back of stragglers); see §5.6. `user_id` denormalized for cheap RLS that doesn't chase the resume FK with a subquery.

```sql
create table resume_chunks (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references resumes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  section_label text not null,
  section_text text not null,
  ordinal int not null,
  embedding vector(1024),
  embedding_source text,
  created_at timestamptz not null default now()
);

-- Unique (resume_id, ordinal) guards against duplicate fan-out inserts.
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
declare
  -- Machine-written columns (embedding write-back, fit-score cache,
  -- cluster recompute) must not reset the staleness signal.
  system_cols constant text[] := array[
    'embedding', 'embedding_source', 'cluster_id',
    'resume_fit_similarity', 'resume_fit_section_label',
    'resume_fit_reasoning', 'resume_fit_computed_at', 'last_updated_at'
  ];
begin
  if old.status is distinct from new.status then
    insert into application_events
      (application_id, user_id, event_type, from_status, to_status)
    values
      (new.id, new.user_id, 'status_change', old.status, new.status);
  end if;
  if (to_jsonb(old) - system_cols) is distinct from (to_jsonb(new) - system_cols) then
    new.last_updated_at := now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger on_status_change
  before update on applications
  for each row execute function log_status_change();
```

`last_updated_at` bumps only when a user-facing column actually changed (migration `20260611212828`); before that guard, every machine write silently reset the kanban's stale indicators.

A second trigger fires on insert to record a 'created' event and to invoke the embedding generation Edge Function asynchronously via pg_net.

### 4.5 Indexes

- B-tree on `applications(user_id, status)` — supports the dashboard's per-status queries.
- B-tree on `applications(user_id, applied_at desc)` — supports recent-first listing.
- IVFFlat on `applications(embedding) using vector_cosine_ops` — **intentionally deferred** until the table reaches a few hundred rows. IVFFlat builds cluster centroids from existing data; with fewer than ~100 rows the clusters are meaningless and a sequential scan is faster anyway. When added, `lists` should be approximately `sqrt(rowcount)` (the standard pgvector heuristic), reviewed once we hit the threshold. HNSW remains overkill at this scale.

---

## 5. Features

### 5.1 Chrome extension

Manifest V3 extension that detects job postings on supported sites, parses them, and saves them to Supabase via a background service worker. Currently supports LinkedIn (`/jobs/*`) and Indeed (`/viewjob*`). Each supported site has its own parser module with multiple fallback selectors. Manual entry is always available as a fallback if parsing fails. Parsers also capture the JD body (PR-D1) into `applications.job_description`, with up to 10KB of text per save; the embedding flow and Haiku scoring both consume it when present.

The popup is a minimal interface showing the five most recently saved applications with status pills, a manual Add Job form, and a link to the dashboard. The extension authenticates via `chrome.identity.launchWebAuthFlow` against Supabase's OAuth endpoint. Tokens are stored in `chrome.storage.local`.

Manifest:

```json
{
  "manifest_version": 3,
  "name": "TrackWise",
  "version": "1.0.0",
  "description": "Track job applications and learn from your search.",
  "permissions": ["storage", "identity"],
  "host_permissions": [
    "https://www.linkedin.com/jobs/*",
    "https://*.indeed.com/viewjob*",
    "https://*.indeed.com/jobs*"
  ],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": [
      "https://www.linkedin.com/jobs/*",
      "https://*.indeed.com/viewjob*",
      "https://*.indeed.com/jobs*"
    ],
    "js": ["content.js"]
  }],
  "action": { "default_popup": "popup.html" }
}
```

### 5.2 Dashboard routing

Next.js App Router with two route groups: `(auth)` for unauthenticated routes and `(app)` for authenticated routes. The proxy (`proxy.ts`, Next.js 16's rename of the middleware convention) enforces authentication on the `(app)` group.

```
app/
  (auth)/
    login/page.tsx               # Google OAuth sign-in (no email/password signup)
  (app)/
    page.tsx                     # Kanban board (default landing)
    analytics/page.tsx           # Analytics dashboard
    applications/page.tsx        # Searchable/filterable list of all applications
    applications/[id]/page.tsx   # Detail view + similar jobs
    resume/page.tsx              # Resume paste/upload + chunked embedding
    settings/page.tsx
  layout.tsx
  proxy.ts                       # Auth guard (Next.js 16 rename of middleware.ts)
```

### 5.3 Kanban board

Default landing page for authenticated users. Five columns map to the status enum: Applied, Screening, Interview, Offer, Rejected. Each card shows company, role, applied date, and a stale indicator if the application has not been updated in more than seven days.

Drag-and-drop between columns uses @dnd-kit/core. On drop, the card's new status is written to Postgres optimistically. The status-change trigger automatically inserts a row into `application_events`, requiring no client logic.

A follow-up digest sits above the columns: a muted line listing warm threads that have gone quiet — applications in Interview or Offer not updated in more than seven days, sorted most-overdue first (capped at five, then `+N more`). Applied and Screening are excluded deliberately (early-stage or cold silence is the norm and a nudge rarely helps); the line renders only when the set is non-empty, so it never nags. It reuses the card's seven-day staleness definition from `lib/applications/stale.ts`.

### 5.4 Analytics page

A weekly application-volume trend plus four response-focused metrics in a single screen, with a date-range filter (last 30 days, 90 days, all time). All respect the active window:

| Metric | Visualization | Data source |
|---|---|---|
| Application volume | Weekly bar chart (full-width, top) | Buckets `applications.applied_at` in the active window; empty weeks shown as zeros |
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

Two embedding paths feed two features:

- **Application similarity (find_similar_applications).** Each application's role + company + notes is embedded as one 1024-dim vector and stored on `applications.embedding`. Cosine over those vectors powers the "Similar applications" section of the detail page.
- **Resume fit (resume_fit_for_application + score_external_job_resume).** Resumes are split into section-level chunks; each chunk is embedded separately and stored in `resume_chunks`. The fit RPC returns the top-5 candidate chunks by cosine against the application's embedding, and a shared scoring module runs them through a Claude Haiku 4.5 call (Anthropic tool-use for structured output) to produce a 0-100 fit score plus a one-sentence reasoning string. Haiku falls back to Voyage `rerank-2.5`, which falls back to raw cosine — three tiers so the card always renders.

**Application embedding (fire-and-forget):**

1. Trigger fires on insert into `applications`, or on update of role/company/notes.
2. Trigger uses pg_net to invoke `generate-embedding` asynchronously.
3. Edge Function reads the row, calls Voyage `voyage-3`, writes the vector + `embedding_source` back. A row-local trigger nulls the resume-fit cache on this row in the same step (it's now stale).
4. Failures leave the row with a null embedding; backfill script reconciles.

**Resume chunking + embedding (PR-C2, fire-and-forget):**

1. Trigger fires on insert into `resumes` or update of `content`.
2. Trigger uses pg_net to invoke `generate-resume-embedding`.
3. Edge Function splits the content into chunks via a multi-tier strategy:
   - **Tier 1 — header detection.** ALL-CAPS lines, markdown headers, or `Title:` lines. Within Projects/Experience, sub-split items on blank lines.
   - **Tier 2 — block split.** If no headers were found, split the whole text on double blank lines.
   - **Tier 3 — single chunk.** Fall back to one `full` chunk so saves never fail to embed.
   - **Merge pass.** Within a section, fold short or continuation-shaped blocks (Tech Stack:, bullet lines, paragraphs whose first line exceeds 60 chars) back into the previous chunk. Prevents over-splitting title+company stubs from their responsibilities.
4. Edge Function batches all chunk texts into **one** Voyage call (`input: string[]`) and writes the N chunk rows in one INSERT. The parent's `embedding_source` is stamped `voyage-3-chunked:<text>` so the backfill script's idempotency check works.

**Resume-fit scoring (Haiku → rerank → cosine, with cache):**

The dashboard's application detail page is a Server Component. On render:

1. Read the application including its cache columns: `resume_fit_similarity`, `resume_fit_section_label`, `resume_fit_reasoning`, `resume_fit_computed_at`.
2. In parallel, read the newest `resume_chunks.created_at` on the user's active resume (the freshness marker).
3. **Cache valid** when `resume_fit_computed_at IS NOT NULL AND >= max(chunk.created_at)`. Lazy comparison — no resume-side invalidation trigger, no fan-out write on resume save.
4. **Cache miss:** call `resume_fit_for_application(application_id, top_k => 5)` for the top-5 candidate chunks, build the query as `${role} at ${company}. ${notes ?? ''}`, invoke the `score-resume-fit` Edge Function via `supabase.functions.invoke()`. The function runs the shared `_shared/fit-scoring.ts` module which tries Claude Haiku 4.5 (tool-use forces structured `{score, best_section_index, reasoning}` JSON), then Voyage `rerank-2.5`, then raw cosine. Write the result back to the cache columns including `reasoning`, render.
5. **Function unreachable from the dashboard:** render the highest-cosine candidate without writing to cache (transient failure shouldn't poison subsequent loads).

The extension overlay's `score-external-job` Edge Function imports the same `_shared/fit-scoring.ts` module so overlay and detail-page scores are comparable. The overlay doesn't cache — every click is an ad-hoc query.

The Anthropic API key lives only as a Supabase secret (`ANTHROPIC_API_KEY`). It never reaches the dashboard `.env` or the browser bundle. The detail page calls the Edge Function so the key surface stays on one server.

> **Why chunks + rerank + Haiku.** voyage-3-lite at 512 dim and voyage-3 at 1024 dim both produced fit scores in the 40s on a strongly-matching real resume (PR-C1, 2026-05-18). Root cause: a single resume vector is an average across all sections, which doesn't look like any concrete job posting → cosine sits at baseline. Chunking (PR-C2) let the matching section's embedding compete on its own. Rerank-2.5 (also PR-C2) addressed conceptual matches that didn't share surface vocabulary, but couldn't help when the rerank query itself was thin (default `${role} at ${company}` with empty notes). Haiku (PR-C3) closes that gap by reasoning about what the role probably requires from its title alone and judging the candidate sections against that — and returns a one-sentence reasoning string that makes the score actionable. See §10 for the measured outcomes at each stage.

> **Known limitation — burst rate-limiting.** Voyage AI's free tier rejects bursts of concurrent requests (observed at ~3+ simultaneous calls during the day-6 backfill). Single-application saves are unaffected because the trigger only fires once per insert, but any batch path (initial backfill, future bulk import, account-merge) must throttle. The Edge Functions retry transient 429/5xx in-place; the backfill script spaces calls by 10s.

> **Known limitation (resolved by PR-C3 + PR-D1) — detail-page fit was bounded by stored application content.** Pre-C3, the rerank query was built as `${role} at ${company}. ${notes ?? ''}` — ~20-50 characters for default extension saves, leaving rerank unable to do more than surface keyword matching. PR-C3 (Haiku) removed that ceiling by reasoning about the role from its title plus candidate resume sections. PR-D1 went further by populating `applications.job_description` from the extension parsers at save time and threading it through both the embedding flow (sharper cosine pre-filter) and the Haiku query (real JD content). Applications saved pre-D1 retain their thin embeddings until edited; the user can re-trigger the chain by editing the row. The other PR-D tracks (D2 manual paste UX, D3 overlay-to-app persistence) remain available if specific gaps emerge but are no longer required for scoring quality.

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
    .maybeSingle()

  const text = `${app.role} at ${app.company}. ${app.notes ?? ''}`

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('VOYAGE_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ input: text, model: 'voyage-3' })
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

### 5.7 Application list

A flat, searchable view of every application at `/applications`, complementing the Kanban board for when the board stops being scannable. Case-insensitive text search over company, role, and location; status filter chips (toggle any of the five); and sortable columns (Company, Applied, Last updated), defaulting to newest-first. Rows link to the detail view. Client-side filter/sort over the server-fetched rows — no new query, no pagination (fine into the hundreds; revisit at thousands).

---

## 6. Security

### 6.1 Authentication

All authenticated requests carry a Supabase-issued JWT. The dashboard uses `@supabase/ssr` for cookie-based session management. The extension uses `chrome.identity.launchWebAuthFlow` and stores tokens in `chrome.storage.local`. Tokens are scoped to the extension's origin and not accessible from other extensions or web pages.

### 6.2 Row-level security

RLS is the primary mechanism preventing cross-user data exposure. Every table, view, and RPC enforces `user_id = auth.uid()`. Policies are tested by attempting cross-user reads with a second test account during development.

### 6.3 Secret management

- Voyage API key: stored as a Supabase Edge Function secret, never in client code.
- Anthropic API key: stored as a Supabase Edge Function secret (`ANTHROPIC_API_KEY`), never in the dashboard `.env` or browser bundle. The dashboard reaches it only via the `score-resume-fit` Edge Function.
- Supabase service role key: used only inside Edge Functions, never exposed to clients.
- Supabase anon (publishable) key: safe to ship in extension and dashboard because RLS gates everything.
- `EDGE_FUNCTION_SECRET`: shared `x-internal-secret` header for the pg_net-triggered functions only (`generate-embedding`, `generate-resume-embedding`). User-invoked functions (`cluster-embeddings`, `score-resume-fit`, `score-external-job`) instead authenticate the caller's JWT and derive the user id server-side via `auth.getUser()` — never from the request body.
- No secrets committed to the repository. `.env.local` files are gitignored.

### 6.6 LLM prompt injection (PR-C3)

The Haiku scoring prompt includes user-controlled content (resume chunk text, job role/company/notes). Containment relies on Anthropic tool-use: `tool_choice` forces the model to respond via the `report_fit` tool, whose schema constrains the output to `{score: int 0-100, best_section_index: int, reasoning: string ≤200 chars}`. The model cannot return arbitrary text or take actions, only fill that schema. Section text is also capped at 2000 chars per candidate before prompt assembly. Realistic threat is low (single-user app; the user attacking their own scores has nothing to gain), but the containment is the same pattern that would protect a multi-user variant.

### 6.4 Extension permissions

The manifest requests only `storage` and `identity`, plus host permissions limited to LinkedIn job pages and Indeed view-job pages. No `<all_urls>`, no `tabs`, no broad permissions. This minimizes the user-facing install warning and Chrome Web Store review friction.

### 6.5 Privacy policy

A privacy policy hosted at `/privacy` on the dashboard, linked from the Chrome Web Store listing. States what data is collected (job information saved by the user, email for authentication), where it is stored (Supabase), that it is not sold or shared, and how users can delete their account and data.

### 6.7 Input hardening (migration `20260611214013`)

RLS scopes rows per user but puts no bound on what a signed-in token can write straight through PostgREST. Three cheap layers close that:

- **Length CHECKs** on every client-writable free-text column (applications: company/role/location 200, source_url 2000, source_site 50, notes 5000, job_description 10000; resumes: label 100, content 50000).
- **Per-user quotas** via `BEFORE INSERT` triggers: applications ≤ 5000, resumes ≤ 20.
- **`resume_chunks` client writes revoked** — only the service-role `generate-resume-embedding` function writes chunks; `authenticated` keeps SELECT.

Accepted residuals, documented in the migration header: no quota on `application_events` (bounded in practice by the applications quota; the event triggers run `security invoker` so the INSERT grant must stay), and no CHECKs on the dormant `salary_min`/`salary_max` columns (no write path exists).

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
  supabase/
    functions/
      _shared/                 # fit-scoring.ts, shared by the scoring functions
      generate-embedding/
      generate-resume-embedding/
      cluster-embeddings/
      score-resume-fit/        # dashboard detail-page fit scoring
      score-external-job/      # extension overlay fit scoring
    migrations/
  scripts/                     # backfill-embeddings.mjs and other one-shots
  CLAUDE.md
  TrackWise.md
  README.md
```

### 7.2 Dashboard

Deploys to Vercel via GitHub integration. Pushes to `main` trigger production deploys. Served from the custom domain `trackwise.bandonc.com` (Cloudflare CNAME to Vercel, DNS-only); the auto-generated `*.vercel.app` URL stays live as a fallback, and both hosts are in Supabase Auth's redirect allowlist. Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`) are set in the Vercel dashboard. `NEXT_PUBLIC_SITE_URL` is the OAuth `redirectTo` base and the only value pinned to the domain — the `/auth/callback` route self-heals off request origin, so both hosts work for sign-in.

### 7.3 Extension

Built locally with `pnpm build`, output to `dist/`. Contents zipped and uploaded to the Chrome Web Store Developer Dashboard. Initial review: 3–7 days. Updates: 1–3 days.

During development: load unpacked from `chrome://extensions` with Developer Mode enabled. Rebuild → refresh extension card → refresh test page.

### 7.4 Database migrations

Managed via the Supabase CLI. Each schema change is a numbered SQL file in `supabase/migrations/`. Migrations are tracked in version control and reviewed alongside code.

### 7.5 Keep-alive

Supabase pauses free-tier projects after seven days of inactivity, tracked against *database activity* specifically. This bit twice: first on 2026-06-10 before the workflow existed, then again on 2026-06-22 despite a green keep-alive run four days earlier — the original `ping()` (migration `20260610232754`) was a constant SQL function (`select 'ok'`) that touched no table, and a constant function did not reliably register as database activity. Migration `20260628120000` replaced it with a `ping()` that performs a real write: it bumps `last_ping` on a singleton `keepalive` table (one row, RLS enabled with no policies so it's unreachable through the Data API; `ping()` is `security definer` with a locked `search_path`, so `anon` can call it without any table grant). `.github/workflows/keep-alive.yml` calls this RPC daily at noon UTC — against the 7-day window that leaves ~6 days of slack, so several consecutive failed runs won't pause the project (the repo is public, so daily costs nothing in Actions minutes). The job fails visibly on any non-200 response. Requires repo secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

Once a project *is* paused the keep-alive can't recover it — the host returns NXDOMAIN, so the Action's curl fails too. Restoring requires logging into Supabase Studio (90-day window; data and config return intact).

Caveat: GitHub auto-disables scheduled workflows after ~60 days without repo activity (it emails a warning first); re-enable from the Actions tab.

---

## 8. Build roadmap

### 8.1 Phased plan

The build order prioritizes a working end-to-end path before depth in any single component. Days 1–7 ship the extension to the Chrome Web Store; days 8–11 extend the dashboard while CWS review runs in parallel (no extension code changes needed for any of them, so no resubmission).

| Day | Goal | Deliverable |
|---|---|---|
| 1 | Vertical slice | Supabase project, schema with RLS, Next.js skeleton with auth and table view of applications |
| 2 | Extension MVP | Vite scaffold, popup with hardcoded save button writing to Supabase, end-to-end test |
| 3 | Real save flow | LinkedIn parser, Indeed parser, content script with injected button, extension auth |
| 4 | Dashboard UX | Kanban board with drag-and-drop, status-change trigger wired up, manual add form |
| 5 | Analytics | Postgres views, /analytics route with four charts, date filter |
| 6 | Semantic search | pgvector setup, Edge Function, embedding trigger, similar applications UI |
| 7 | Polish + ship | Privacy policy, README with screenshots, demo gif, Chrome Web Store submission, cross-account RLS verification |
| 8 | Quick wins | Editable notes on `/applications/[id]`; CSV export |
| 9–10 | Clustering analytics | K-means on embeddings, response-rate-per-cluster view, Voyage 429 retry/backoff |
| 11 | Resume + in-context matching | `resumes` table + embedding; resume-fit score on application detail page; content-script overlay shows "this job is N% similar to your history" and "M% match to your resume" on LinkedIn/Indeed job pages |
| 12 | Fit-score quality | Address the input-poverty ceiling exposed by PR-C2 (chunking + rerank-2.5). The detail-page rerank query is `${role} at ${company}. ${notes ?? ''}`, which is ~20-50 chars for typical applications because notes is empty by default. See the four mitigation tracks below. |

Total estimated effort: 40–55 hours of focused work across days 1–11. Day 12 is additive and scoped per-track.

#### Day 12 — Fit-score quality tracks

Four mitigation options identified during PR-C2 measurement. They're complementary; the recommended sequence is C3 first (universal floor), then D1 (extension capture). Track D2 and D3 are situational.

- **PR-C3 — LLM-based scoring (Claude Haiku). SHIPPED 2026-05-20.** Replaced the rerank-only path with `{resume chunks, role, company, notes}` → Claude Haiku 4.5 → fit score with one-sentence reasoning. Lives in `supabase/functions/_shared/fit-scoring.ts`; called by both the new `score-resume-fit` Edge Function (dashboard) and `score-external-job` (extension). Fallback chain Haiku → rerank → cosine preserves the PR-C2 win as the middle tier. Measured spread between matching jobs and the camp-counselor control widened from 24pt (rerank) to 30pt (Haiku), and scores are now accompanied by actionable explanations of what the resume is missing.
- **PR-D1 — Extension parser captures JD body. SHIPPED 2026-05-20.** New `applications.job_description text` column distinct from `notes` (notes stays for user commentary). LinkedIn and Indeed parsers extract the JD body into the new column (10KB cap at parse time, 8KB cap for embedding input, 4KB cap for the Haiku query). Embedding flow concatenates it into the source text, and the score-resume-fit / score-external-job query includes it so Haiku judges against the real posting. Smoke result on a new Snowflake SWE save: 72% with Haiku reasoning explicitly citing JD requirements ("scalable, testable code design") and matched candidate sections ("Node.js/React and relational databases"). Doesn't help applications saved before this track shipped — they keep their pre-D1 embedding source until edited.
- **PR-D2 — Manual paste UX on detail page.** Stopgap content fix that works for any save path. Adds a "Paste job description" textarea on detail pages without a populated JD column. User-initiated per application; useful for backfilling D1's gap on existing rows, and for users on save paths D1 doesn't cover (manual add form).
- **PR-D3 — Overlay-to-app persistence.** Bridge fix. When the extension overlay's "Check fit" button runs against a page whose URL matches an existing application, persist the overlay's rerank result into that app's cache columns. The detail page then displays the (richer) overlay-derived score. Cheap and clever but only helps the subset of applications the user actively re-checks via the overlay.
- **Deliberately NOT pursued — server-side re-scraping of the source URL.** LinkedIn and Indeed actively block server-side scrapers (anti-bot, IP blocks), and the ToS concerns from §10 still apply. Client-side re-scraping requires the extension to be open, which makes it equivalent to D3 minus the persistence step. Not worth the operational surface.

Per-day proper feature specs (in §5) are written in the same commit as that day's implementation work — the table above is the index, not the design.

### 8.2 V2 — deferred until usage justifies the cost

Features previously called "near-term" have been pulled into v1 (days 8–11, see §8.1). Everything below is genuinely post-v1: each item carries a real cost (review surface, ongoing maintenance, or external verification) that isn't worth paying until a specific signal — user demand, scale, or workflow evidence — appears.

- **Gmail integration via OAuth + Gmail API.** Auto-detect status changes from incoming emails. High value, but Google's sensitive-scope verification can take weeks and adds significant Chrome Web Store review surface. Signal to revisit: 5+ users explicitly asking for it.
- **Additional job boards** (Wellfound, Y Combinator's Work at a Startup, Glassdoor, university career portals). Pure parser work, but each adds a CWS host-permission review burden and ongoing maintenance as DOMs change. Signal to revisit: a board the primary user is actively applying through.
- **Resume version tagging.** Useful only when the user is iterating resumes; modest data-model work (foreign key from `applications` to the day-11 `resumes` table + analytics filter), little payoff without that usage pattern. Becomes much cheaper once day 11 ships, so this is a likely first post-v1 addition if the resume-matching feature actually gets used.
- **Browser notifications for stale applications.** Permission-prompt UX friction; the kanban's stale-dot already surfaces this in the dashboard. Signal to revisit: user actively missing follow-ups despite the in-app indicator.

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LinkedIn DOM changes break parser | High | Medium | Multiple fallback selectors; manual entry always available; parser fails gracefully |
| Chrome Web Store review rejection | Medium | Low | Narrow permissions; specific permission justifications; privacy policy in place before submission |
| Supabase project pausing | Medium | Medium | Twice-weekly GitHub Action ping (see §7.5); restoring a paused project requires the Supabase dashboard |
| Voyage API rate limits or downtime | Low | Low | Embeddings are fire-and-forget; nightly retry job for failed embeddings |
| Manifest V3 service worker termination losing state | High | Low | All state persisted to chrome.storage.local; worker is stateless |
| RLS policy misconfiguration exposing data | Low | High | Tested with second account during development; policies reviewed before launch |

---

## 10. Notable decisions

Lightweight decision log. Each entry is the choice made and the reason in one or two lines. When a decision changes, update the entry — git history preserves the prior version.

- **Voyage AI over OpenAI for embeddings.** Voyage's free tier is more generous; voyage-3 at 1024 dimensions still beats OpenAI's 1536.
- **`@supabase/ssr` over `@supabase/auth-helpers-nextjs`.** auth-helpers was deprecated in 2024.
- **Vanilla TypeScript in the extension, not React.** Bundle size matters for content scripts; Manifest V3 service workers don't need a UI framework.
- **Postgres triggers for status-change logging, not client code.** Keeps the event log consistent regardless of who or what updates `status`. Client never writes to `application_events` for status changes.
- **pgvector with IVFFlat instead of HNSW, *and not built until row count justifies it*.** IVFFlat is fine up to a few thousand rows; HNSW is overkill for v1. The index itself is deferred until ~hundreds of rows exist, because IVFFlat needs real data to build meaningful cluster centroids — sequential scan is faster on tiny tables anyway. See §4.5.
- **Embedding-generation secrets in Supabase Vault, not Postgres GUCs.** The pg_net trigger reads the function URL and shared secret from `vault.decrypted_secrets`. Vault gives encryption at rest, audit log, and rotation — the production-grade pattern. The trigger function is `security definer` (with `set search_path = ''`) so the `authenticated` role need not be granted vault access directly.
- **Embeddings are fire-and-forget.** Triggered async via pg_net; saves don't block on embedding generation. Failures leave the row with a null embedding and get retried later.
- **Server actions over API routes** in the dashboard. Simpler, progressive enhancement built in. API routes only when there's a specific reason (e.g., third-party callbacks).
- **Three Supabase clients** in the dashboard (server, browser, middleware). Each serves a specific context; mixing them silently breaks auth.
- **Supabase over Firebase.** Postgres is more resume-friendly than Firestore; Supabase reduces vendor lock-in.
- **Embedding dimension locked to 1024** (voyage-3). Originally 512 (voyage-3-lite); upgraded on 2026-05-18 after the resume-fit feature shipped (day 11) and produced 47% fit scores on strongly-matching real resumes. voyage-3 has stronger long-document semantic preservation and twice the dimensionality. Migration `20260518120000_voyage3_upgrade.sql` nullified every embedding; `scripts/backfill-embeddings.mjs --all` regenerated them under the new model, stamping `embedding_source` with a `voyage-3:` prefix so the script is idempotent across interruptions. Free-tier headroom unchanged (<500K tokens vs 200M cap). The upgrade alone did **not** resolve the dilution problem — software roles scored 40-46% and a control (camp counselor) scored 27%, a meaningful separation but absolute scores remained low because the single-vector resume averages across all sections. Section-chunked resumes (PR-C2) address this. Changing models again requires the same careful migration pattern.
- **V1 scope extended to days 8–11 after day 6 finished ahead of schedule.** Editable notes, CSV export, clustering analytics, Voyage rate-limit handling, resume embeddings, and in-context similarity were originally v2; they're now days 8–11 of v1. The CWS extension submission still happens at end of day 7 — none of days 8–11 touch the extension, so they run in parallel with the 3–7 day store review without needing a resubmission.
- **No automated scraping of LinkedIn or Indeed for "find similar jobs."** Both sites' ToS forbid it, user account flagging is a real risk, and the broader host/`tabs` permissions would harm CWS review. The shipped pattern (day 11) is in-context: when the user is already on a job page, the content script computes similarity against their history using the embeddings already in place. Zero new scraping, zero new permissions.
- **Resume content stored as plain text, embedded once per version.** Paste-text input in v1 (day 11) keeps the parsing surface zero. PDF upload + parse stays out of v1; revisit if users actually ask. Voyage call per resume version is rare enough that no separate retry pipeline is needed beyond the day-9 one.
- **Resume fit moved to section-chunked embeddings + cross-encoder rerank** (PR-C2, 2026-05-19/20). The voyage-3-lite → voyage-3 model upgrade (PR-C1) widened the spread between matching and control jobs but left absolute fit scores in the 40s because the single resume vector averaged across all sections. PR-C2 splits resumes into chunks (SKILLS / EDUCATION / SUMMARY as one each; one chunk per project under Projects; one chunk per role under Experience), stored in `resume_chunks` with cascade-on-delete and a `(resume_id, ordinal)` unique index. The fit RPCs now return the top-5 candidates by cosine; the dashboard server component and the `score-external-job` Edge Function hand those to Voyage `rerank-2.5` for the final score. Cache lives on `applications` (`resume_fit_*` columns) with lazy timestamp-based invalidation against `max(resume_chunks.created_at)` for the active resume — no fan-out trigger on resume save, scales to any application count. Latency is acceptable for solo-user MVP (one rerank call per cache miss). Migration sequence: `20260519120000_resume_chunks.sql` (additive table) → deploy chunking function → backfill → `20260519120100_resume_chunks_swap.sql` (drops `resumes.embedding`, swaps fit RPCs) → `20260520120000_resume_fit_rerank.sql` (cache columns + top-K return shape). On the live test set (12 applications, one resume), software roles broke ~22 pt above the cosine baseline that the camp-counselor control sat at — the discrimination signal that the pre-chunk pipeline could not produce.
- **Resume fit replaced with Claude Haiku scoring** (PR-C3, 2026-05-20). PR-C2's chunk + rerank pipeline measurably widened the spread between matching and control jobs (24pt) but absolute scores on the dashboard detail page were bounded by input poverty: the rerank query is `${role} at ${company}. ${notes ?? ''}`, which for a default extension save is ~20-50 characters. Rerank could only do surface-keyword matching against that thin input. PR-C3 routes top-5 cosine candidates through Claude Haiku 4.5 (Anthropic tool-use forces structured `{score, best_section_index, reasoning}` JSON), which reasons about what the role probably requires from just the title and judges the candidate sections against that. New schema column `resume_fit_reasoning text` persists the one-sentence explanation alongside the existing cache columns; trigger in `20260520150000_resume_fit_reasoning.sql` extends `invalidate_application_fit_cache()` to clear it in lockstep. The scoring algorithm lives in `supabase/functions/_shared/fit-scoring.ts` as `scoreFit()` with a Haiku → rerank → cosine fallback chain; both the new `score-resume-fit` Edge Function (dashboard detail page) and the existing `score-external-job` (extension overlay) call it, so the two surfaces produce comparable numbers. `ANTHROPIC_API_KEY` lives only as a Supabase secret, never in the dashboard `.env` or browser bundle. Measured on the live test set: matching-vs-control spread widened from 24pt (rerank) to 30pt (Haiku); the control's absolute score dropped from 25% to 15% as Haiku correctly recognized camp counseling has no connection to a CS resume. The qualitative win is the reasoning string — telling the user "lacks ML, deep learning, model training" for an AI Engineer role is feedback rerank could never produce. Cost is ~$0.001 per cache miss; cache hits are free. The PR-D tracks (extension JD capture, manual paste, overlay persistence) are de-prioritized — they remain useful for JD visibility on the detail page, but PR-C3 already resolves the scoring quality problem they were meant to address.
- **Extension captures job-description body into a dedicated column** (PR-D1, 2026-05-20). PR-C3 (Haiku scoring) had already lifted the dashboard's per-application fit out of the input-poverty trap by reasoning about the role from its title alone, but the score quality was still bounded at the cosine pre-filter step: thin application embedding → noisy top-K candidate selection → Haiku might never see the most relevant resume section. PR-D1 fixes that at the source by populating `applications.job_description text` from the LinkedIn and Indeed parsers at save time. Caps applied at three layers: 10KB at the parser (defense against pathological pages), 8KB when concatenated into the embedding source (free-tier token budget), and 4KB when included in the Haiku scoring query (per-call cost). The embedding trigger (`on_application_updated_embed`) now also watches `job_description`, so editing it re-fires the whole chain; the existing row-local fit-cache invalidation handles the rest. As a side benefit, the dashboard detail page renders the captured JD in a collapsible section so the user can read it without leaving the dashboard. Verified end-to-end: a Snowflake SWE save with a 581-char JD produced a 72% fit score with Haiku citing actual JD requirements ("scalable, testable code design", "Node.js/React and relational databases" matching "Snowflake's core requirements") — feedback that's impossible without the JD in context. Trade-offs and known limits: parser selectors are tied to LinkedIn/Indeed DOM and will break when those sites restructure (mitigation: multi-selector fallback in both parsers); a save click that lands before LinkedIn finishes lazy-loading the JD body captures only the section header (workaround: refresh + wait for visible content before saving — possible future polish: parser-level wait-for-content guard). Applications saved pre-D1 keep their thin embeddings until edited; we did not backfill. The deliberately-not-pursued PR-D options (D2 manual paste UX, D3 overlay-to-app persistence, server-side re-scraping of source URLs) remain documented for the same reasons as before — D2/D3 are narrow value-adds that solve subsets of what D1 already covers; URL re-scraping is blocked by LinkedIn/Indeed anti-bot enforcement and ToS regardless of how cleverly it's implemented.
- **Chrome extension auth via `chrome.identity.launchWebAuthFlow`**, not the Supabase SDK's default browser flow. The default flow doesn't work cleanly in an extension popup context.
- **Supabase pausing handled via GitHub Action**, not manual dashboard pings. Visible in the repo; serves as a small DevOps demonstration.
- **`cluster-embeddings` moved from shared-secret to user-JWT auth** (2026-06-11). The original design authenticated via `x-internal-secret` and took `userId` from the request body — meaning anyone holding the secret could recompute any user's clusters. Now deployed with `verify_jwt`; the function resolves the user via `auth.getUser()` on the Authorization token, and the dashboard calls it through `supabase.functions.invoke()`, which forwards the session JWT. `EDGE_FUNCTION_SECRET` remains only for the pg_net-triggered embedding functions, which have no calling user.
- **`last_updated_at` bumps only on user-facing changes** (2026-06-11). The status-change trigger previously refreshed it on every update, so machine writes (embedding write-back, fit-score cache on detail view, cluster recompute) silently reset the kanban's stale indicators. The trigger now diffs OLD/NEW as jsonb with system columns removed. New machine-written columns must be added to the trigger's `system_cols` list.
- **Per-user write bounds on top of RLS** (2026-06-11). Length CHECKs on all client-writable text columns, insert quotas (applications ≤ 5000, resumes ≤ 20), and `resume_chunks` client writes revoked — see §6.7. RLS isolates users from each other; these bound what a hostile or buggy client can do to its own account's storage.
- **Extension fit cache keyed on parser-derived job id, not URL** (2026-06-12, v1.0.2). LinkedIn/Indeed search-page URLs churn unrelated query params while showing the same posting, so URL keying re-scored the same job per variant. Parsers expose `jobKey(url)` (`linkedin:<id>` / `indeed:<jk>`); the background falls back to the full href when no id extracts — deliberately not query-stripped, since search-page paths are identical across jobs.
- **Dashboard moved to a custom domain** (`trackwise.bandonc.com`, 2026-07-10). Chose a subdomain over the apex (`bandonc.com` reserved for a future portfolio); Cloudflare CNAME to Vercel, DNS-only. The only domain-coupled code is `NEXT_PUBLIC_SITE_URL` (the OAuth `redirectTo` base) — `/auth/callback` self-heals off request origin, the extension auths via `chromiumapp.org`, and Google OAuth points at the Supabase project URL, so none of those change with the dashboard domain. The `*.vercel.app` URL is kept live as a fallback (both hosts in the Supabase Auth allowlist); dropping the domain later means reverting `SITE_URL` and scrubbing the two Supabase Auth entries before the name expires.
- **`signInWithGoogle` throws on a missing `NEXT_PUBLIC_SITE_URL`** (2026-07-09). Fail loud instead of building `redirectTo: "undefined/auth/callback"` and hitting an opaque Supabase "redirect not allowed" error at runtime.
- **Follow-up digest scoped to Interview + Offer** (2026-07-10). A board-top muted line for warm threads gone quiet (>7 days). Applied and Screening are excluded on purpose — like a cold application, early-stage silence is the norm and a nudge rarely helps; after an interview it does. Renders only when non-empty so it never nags. Reuses the card's 7-day staleness, extracted to `lib/applications/stale.ts` so the two can't drift.
- **Weekly application-volume chart on Analytics** (2026-07-10). Full-width bars at the top, one per UTC-aligned week, empty weeks as zeros. Reuses the `v_response_rate` rows the page already fetches (window-filtered) — no new query or view. Respects the range filter; "all time" starts at the earliest application.
- **Searchable application list at `/applications`** (2026-07-10). Client-side search/filter/sort over server-fetched rows; the scalable complement to the board, kept independent of the digest's `stale.ts` so it merges on its own. Shipped with `scrollbar-gutter: stable` in `globals.css` to kill filter-induced layout shift (centered content jumping as the row count toggles the scrollbar) — a global fix that steadies every page.

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
