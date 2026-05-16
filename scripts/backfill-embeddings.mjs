// Backfill embeddings for applications whose embedding column is null.
//
// One-shot utility for rows that landed null because of Voyage rate-limit
// failures predating the in-place retry/backoff in generate-embedding
// (see TrackWise.md §5.6). Calls the same Edge Function the insert
// trigger uses, with a small sleep between requests so the burst doesn't
// re-trigger the original rate limit.
//
// Reuses test/.env.local for credentials (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, EDGE_FUNCTION_SECRET) so there's only one
// place to keep secrets.
//
// Usage:
//   node scripts/backfill-embeddings.mjs --user <uuid>           # dry-run
//   node scripts/backfill-embeddings.mjs --user <uuid> --apply   # do it
//
// Dry-run lists candidate rows and exits. --apply iterates them, calling
// generate-embedding once per row with a 3s gap. Idempotent: if a row
// embeds successfully you can re-run and it won't be picked up again.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const userIdx = args.indexOf('--user')
const userId = userIdx >= 0 ? args[userIdx + 1] : null
const apply = args.includes('--apply')

if (!userId) {
  console.error('--user <uuid> is required')
  process.exit(2)
}

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

// Fetch candidate rows via service role (bypasses RLS so we can see the
// user's data without their JWT). Still scoped to the requested user_id.
const listRes = await fetch(
  `${URL}/rest/v1/applications?user_id=eq.${userId}&embedding=is.null&select=id,company,role,applied_at&order=applied_at.asc`,
  { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } },
)
if (!listRes.ok) {
  console.error(`list failed ${listRes.status}: ${await listRes.text()}`)
  process.exit(1)
}
const rows = await listRes.json()

console.log(`Found ${rows.length} application(s) with null embedding for user ${userId}:`)
for (const r of rows) {
  console.log(`  ${r.id}  ${r.applied_at}  ${r.company} — ${r.role}`)
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
  const res = await fetch(`${URL}/functions/v1/generate-embedding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': EDGE_SECRET },
    body: JSON.stringify({ applicationId: r.id }),
  })
  const status = res.status
  const body = await res.text().catch(() => '')
  if (res.ok) {
    ok++
    console.log(`  [${i + 1}/${rows.length}] OK   ${r.id}  ${r.company}`)
  } else {
    fail++
    console.log(`  [${i + 1}/${rows.length}] FAIL ${status} ${r.id}  ${r.company} — ${body}`)
  }
  if (i < rows.length - 1) await sleep(BETWEEN_CALLS_MS)
}

console.log('')
console.log(`Done: ${ok} ok, ${fail} failed.`)
if (fail > 0) {
  console.log('Re-run the script (without --apply) to see which rows are still null.')
  process.exit(1)
}
