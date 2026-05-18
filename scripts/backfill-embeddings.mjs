// Backfill embeddings for applications or resumes.
//
// Two modes:
//   default  -- regenerates rows whose embedding column is null
//               (original use case: rows that landed null because of
//               Voyage rate-limit failures predating the in-place
//               retry/backoff in generate-embedding -- see
//               TrackWise.md §5.6).
//   --all    -- regenerates every row that hasn't been written under
//               the current model. Used during model migrations
//               (e.g. voyage-3-lite -> voyage-3). Idempotent across
//               interruptions: the Edge Function stamps
//               embedding_source with a 'voyage-3:' prefix on
//               success, and --all skips rows already so stamped.
//
// Reuses test/.env.local for credentials (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, EDGE_FUNCTION_SECRET).
//
// Usage:
//   node scripts/backfill-embeddings.mjs --user <uuid>                         # apps, nulls only (dry-run)
//   node scripts/backfill-embeddings.mjs --user <uuid> --apply                 # apps, nulls only
//   node scripts/backfill-embeddings.mjs --user <uuid> --all --apply           # apps, regen all
//   node scripts/backfill-embeddings.mjs --user <uuid> --table resumes --all --apply
//   node scripts/backfill-embeddings.mjs --user <uuid> --table resumes --apply --limit 5  # smoke test

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
function flag(name) {
  return args.includes(name)
}
function value(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}

const userId = value('--user')
const apply = flag('--apply')
const all = flag('--all')
const table = value('--table') ?? 'applications'
const limitArg = value('--limit')
const limit = limitArg ? Number(limitArg) : null

if (!userId) {
  console.error('--user <uuid> is required')
  process.exit(2)
}
if (table !== 'applications' && table !== 'resumes') {
  console.error('--table must be applications or resumes')
  process.exit(2)
}
if (limitArg && (!Number.isInteger(limit) || limit <= 0)) {
  console.error('--limit must be a positive integer')
  process.exit(2)
}

// Per-table config: which endpoint, body key, display fields.
const CONFIG = {
  applications: {
    endpoint: 'generate-embedding',
    bodyKey: 'applicationId',
    selectFields: 'id,company,role,applied_at,embedding_source',
    orderBy: 'applied_at.asc',
    describe: (r) => `${r.applied_at}  ${r.company} — ${r.role}`,
  },
  resumes: {
    endpoint: 'generate-resume-embedding',
    bodyKey: 'resumeId',
    selectFields: 'id,label,created_at,embedding_source',
    orderBy: 'created_at.asc',
    describe: (r) => `${r.created_at}  ${r.label}`,
  },
}
const cfg = CONFIG[table]

const envPath = join(__dirname, '..', 'test', '.env.local')
let envText
try {
  envText = readFileSync(envPath, 'utf8')
} catch {
  console.error(`missing ${envPath} — reuses test env for credentials`)
  process.exit(2)
}
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i), l.slice(i + 1)]
    }),
)

const URL = env.SUPABASE_URL
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const EDGE_SECRET = env.EDGE_FUNCTION_SECRET
if (!URL || !SVC || !EDGE_SECRET) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / EDGE_FUNCTION_SECRET required in test/.env.local')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 10s spacing gives Voyage's per-minute window room to forgive between
// calls. 3s was enough for the per-second burst limit but tripped the
// longer-window limiter — observed during the day 9–10 backfill run.
const BETWEEN_CALLS_MS = 10000

// Row filter:
//   default: embedding is null
//   --all:   embedding is null OR embedding_source doesn't yet carry
//            the voyage-3 marker (i.e. wasn't written by the new
//            generate-embedding function). PostgREST OR syntax.
//
// "*" in PostgREST like-patterns is the SQL "%" wildcard. The pattern
// is URL-encoded so the literal colon survives the request.
const filter = all
  ? `or=(embedding.is.null,embedding_source.not.like.${encodeURIComponent('voyage-3:*')})`
  : `embedding=is.null`

let listUrl =
  `${URL}/rest/v1/${table}?user_id=eq.${userId}` +
  `&${filter}` +
  `&select=${cfg.selectFields}` +
  `&order=${cfg.orderBy}`
if (limit) listUrl += `&limit=${limit}`

const listRes = await fetch(listUrl, {
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
})
if (!listRes.ok) {
  console.error(`list failed ${listRes.status}: ${await listRes.text()}`)
  process.exit(1)
}
const rows = await listRes.json()

const modeLabel = all ? 'all rows not yet on voyage-3' : 'rows with null embedding'
console.log(`Found ${rows.length} ${table} row(s) — ${modeLabel} — for user ${userId}:`)
for (const r of rows) {
  console.log(`  ${r.id}  ${cfg.describe(r)}`)
}

if (!apply) {
  console.log('')
  console.log('(dry-run — re-run with --apply to backfill)')
  process.exit(0)
}

if (rows.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

console.log('')
console.log(`Applying — ~${(rows.length * BETWEEN_CALLS_MS) / 1000}s minimum runtime.`)

let ok = 0
let fail = 0
for (let i = 0; i < rows.length; i++) {
  const r = rows[i]
  const res = await fetch(`${URL}/functions/v1/${cfg.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': EDGE_SECRET },
    body: JSON.stringify({ [cfg.bodyKey]: r.id }),
  })
  const status = res.status
  const body = await res.text().catch(() => '')
  if (res.ok) {
    ok++
    console.log(`  [${i + 1}/${rows.length}] OK   ${r.id}`)
  } else {
    fail++
    console.log(`  [${i + 1}/${rows.length}] FAIL ${status} ${r.id} — ${body}`)
  }
  if (i < rows.length - 1) await sleep(BETWEEN_CALLS_MS)
}

console.log('')
console.log(`Done: ${ok} ok, ${fail} failed.`)
if (fail > 0) {
  console.log('Re-run the script (without --apply) to see which rows are still pending.')
  process.exit(1)
}
