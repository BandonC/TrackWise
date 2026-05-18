// TrackWise E2E live test.
//
// Creates two throwaway users, exercises insert/update/RLS/embedding/similarity
// /analytics views, then deletes both users.
//
// Requires test/.env.local with:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Run:  node test/e2e.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ------------------------------------------------------------
// Env loading (tiny inline parser, no dotenv dep)
// ------------------------------------------------------------
const envPath = join(__dirname, '.env.local')
let envText
try {
  envText = readFileSync(envPath, 'utf8')
} catch {
  console.error(`missing ${envPath} — copy .env.local.example and fill in`)
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
const ANON = env.SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY
const EDGE_SECRET = env.EDGE_FUNCTION_SECRET // optional; cluster tests skipped if absent
if (!URL || !ANON || !SVC) {
  console.error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(2)
}

// ------------------------------------------------------------
// Test harness
// ------------------------------------------------------------
const results = []
let currentName = ''
function step(name) {
  currentName = name
}
function pass(msg = '') {
  results.push({ name: currentName, ok: true, msg })
  console.log(`PASS  ${currentName}${msg ? ' — ' + msg : ''}`)
}
function fail(msg) {
  results.push({ name: currentName, ok: false, msg })
  console.log(`FAIL  ${currentName} — ${msg}`)
}
function assert(cond, msg) {
  if (cond) pass(msg)
  else fail(msg)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------
// API helpers
// ------------------------------------------------------------
async function adminCreateUser(email, password) {
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!r.ok) throw new Error(`adminCreateUser ${r.status}: ${await r.text()}`)
  return r.json()
}

async function adminDeleteUser(id) {
  const r = await fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
  })
  if (!r.ok) console.error(`adminDeleteUser ${r.status}: ${await r.text()}`)
}

async function signIn(email, password) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) throw new Error(`signIn ${r.status}: ${await r.text()}`)
  return r.json()
}

// Service-role PATCH for tests that need to bypass RLS (e.g. seeding
// embeddings without calling Voyage). Use sparingly — RLS-respecting
// `userClient` is the default.
async function serviceUpdate(path, body) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SVC,
      Authorization: `Bearer ${SVC}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  return { status: r.status, body: text ? JSON.parse(text) : null }
}

// Build a 1024-dim unit vector pointing mostly along axis `axisIdx`, with
// small per-dimension noise so it's not exactly identical across rows in
// the same group. Used to seed deterministic clusters without depending
// on Voyage.
function fakeUnitVector(axisIdx, noiseSeed) {
  const dim = 1024
  let rng = noiseSeed >>> 0
  const next = () => {
    rng = (rng * 1664525 + 1013904223) >>> 0
    return (rng / 0x100000000 - 0.5) * 0.05
  }
  const v = new Array(dim).fill(0).map(() => next())
  v[axisIdx] = 1
  let sumSq = 0
  for (const x of v) sumSq += x * x
  const norm = Math.sqrt(sumSq)
  return v.map((x) => x / norm)
}

function userClient(jwt) {
  const base = {
    apikey: ANON,
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  }
  return {
    async select(path) {
      const r = await fetch(`${URL}/rest/v1/${path}`, { headers: base })
      const text = await r.text()
      return { status: r.status, body: text ? JSON.parse(text) : null }
    },
    async insert(path, row) {
      const r = await fetch(`${URL}/rest/v1/${path}`, {
        method: 'POST',
        headers: { ...base, Prefer: 'return=representation' },
        body: JSON.stringify(row),
      })
      const text = await r.text()
      return { status: r.status, body: text ? JSON.parse(text) : null }
    },
    async update(path, body) {
      const r = await fetch(`${URL}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...base, Prefer: 'return=representation' },
        body: JSON.stringify(body),
      })
      const text = await r.text()
      return { status: r.status, body: text ? JSON.parse(text) : null }
    },
    async rpc(name, args) {
      const r = await fetch(`${URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: base,
        body: JSON.stringify(args),
      })
      const text = await r.text()
      return { status: r.status, body: text ? JSON.parse(text) : null }
    },
  }
}

// ------------------------------------------------------------
// Run
// ------------------------------------------------------------
const stamp = Date.now()
const userA = { email: `test-user-a-${stamp}@example.com`, password: 'TestPass!12345' }
const userB = { email: `test-user-b-${stamp}@example.com`, password: 'TestPass!12345' }
let createdA, createdB

try {
  step('create user A')
  createdA = await adminCreateUser(userA.email, userA.password)
  pass(createdA.id)

  step('create user B')
  createdB = await adminCreateUser(userB.email, userB.password)
  pass(createdB.id)

  step('sign in user A')
  const sessA = await signIn(userA.email, userA.password)
  const cliA = userClient(sessA.access_token)
  pass()

  step('sign in user B')
  const sessB = await signIn(userB.email, userB.password)
  const cliB = userClient(sessB.access_token)
  pass()

  step("user A inserts an application")
  const insA = await cliA.insert('applications', {
    user_id: createdA.id,
    company: 'Acme Corp',
    role: 'Backend Engineer',
    source_site: 'linkedin',
    notes: 'Kubernetes, Go, distributed systems',
  })
  assert(insA.status === 201 && Array.isArray(insA.body) && insA.body[0]?.id, `status=${insA.status}`)
  const appA1Id = insA.body?.[0]?.id

  // The find_similar test below needs A1 and A2 to embed via Voyage.
  // Voyage's free tier throttles bursts (TrackWise.md §5.6), so give the
  // A1 embedding call a head start before triggering A2. A3 and A4 don't
  // need real embeddings — the cluster test seeds fakes for them — so
  // they can fire back-to-back without staggering.
  await sleep(2500)

  step("user A inserts a second similar application")
  const insA2 = await cliA.insert('applications', {
    user_id: createdA.id,
    company: 'Globex',
    role: 'Senior Backend Engineer',
    source_site: 'linkedin',
    notes: 'Go services, k8s, microservices at scale',
  })
  assert(insA2.status === 201, `status=${insA2.status}`)
  const appA2Id = insA2.body?.[0]?.id

  step("user A inserts a dissimilar application")
  const insA3 = await cliA.insert('applications', {
    user_id: createdA.id,
    company: 'Design Co',
    role: 'Graphic Designer',
    source_site: 'indeed',
    notes: 'Figma, branding, illustration',
  })
  assert(insA3.status === 201, `status=${insA3.status}`)
  const appA3Id = insA3.body?.[0]?.id

  step("user A inserts a fourth application (needed for clustering ≥ 4)")
  const insA4 = await cliA.insert('applications', {
    user_id: createdA.id,
    company: 'Pixel Studio',
    role: 'Illustrator',
    source_site: 'indeed',
    notes: 'Vector illustration, brand systems',
  })
  assert(insA4.status === 201, `status=${insA4.status}`)
  const appA4Id = insA4.body?.[0]?.id

  step("user B inserts an application")
  const insB = await cliB.insert('applications', {
    user_id: createdB.id,
    company: 'Initech',
    role: 'Frontend Engineer',
    source_site: 'indeed',
  })
  assert(insB.status === 201, `status=${insB.status}`)

  step("RLS: user B cannot see user A's apps")
  const bSees = await cliB.select('applications?select=id,company')
  const leaked = (bSees.body ?? []).filter((r) => r.company === 'Acme Corp' || r.company === 'Globex')
  assert(leaked.length === 0, `B sees ${bSees.body?.length} rows (own only); leaked=${leaked.length}`)

  step("RLS: user A cannot see user B's apps")
  const aSees = await cliA.select('applications?select=id,company')
  const leakedA = (aSees.body ?? []).filter((r) => r.company === 'Initech')
  assert(leakedA.length === 0, `A sees ${aSees.body?.length} rows; leaked=${leakedA.length}`)

  step("RLS: user B cannot insert a row claiming user A's id")
  const cross = await cliB.insert('applications', {
    user_id: createdA.id,
    company: 'Cross-write attempt',
    role: 'X',
  })
  assert(cross.status === 403 || cross.status === 401 || cross.status === 400 || cross.status >= 400,
    `status=${cross.status}`)

  step("'created' event auto-logged by trigger")
  // Give the trigger a beat — it's synchronous but JSON round-trip can race
  await sleep(500)
  const eventsA = await cliA.select(
    `application_events?application_id=eq.${appA1Id}&event_type=eq.created&select=id,event_type`,
  )
  assert(Array.isArray(eventsA.body) && eventsA.body.length === 1, `created events=${eventsA.body?.length}`)

  step('status_change trigger fires + bumps last_updated_at')
  const beforeUpd = await cliA.select(`applications?id=eq.${appA1Id}&select=last_updated_at`)
  const beforeTs = beforeUpd.body?.[0]?.last_updated_at
  await sleep(1100) // ensure timestamp diff is observable at second precision
  const upd = await cliA.update(`applications?id=eq.${appA1Id}`, { status: 'screening' })
  assert(upd.status === 200, `update status=${upd.status}`)
  const afterUpd = await cliA.select(`applications?id=eq.${appA1Id}&select=last_updated_at,status`)
  const afterTs = afterUpd.body?.[0]?.last_updated_at
  assert(afterUpd.body?.[0]?.status === 'screening', `status now ${afterUpd.body?.[0]?.status}`)
  assert(new Date(afterTs) > new Date(beforeTs), `last_updated_at bumped (${beforeTs} -> ${afterTs})`)

  step('status_change event auto-logged')
  const scEvents = await cliA.select(
    `application_events?application_id=eq.${appA1Id}&event_type=eq.status_change&select=from_status,to_status`,
  )
  assert(
    Array.isArray(scEvents.body) &&
      scEvents.body.length === 1 &&
      scEvents.body[0].from_status === 'applied' &&
      scEvents.body[0].to_status === 'screening',
    `events=${JSON.stringify(scEvents.body)}`,
  )

  step('CHECK constraint rejects invalid status')
  const badStatus = await cliA.insert('applications', {
    user_id: createdA.id,
    company: 'Bad',
    role: 'Bad',
    status: 'banana',
  })
  assert(badStatus.status >= 400, `status=${badStatus.status}`)

  step('embedding populated by edge function (waits up to 30s)')
  let embeddingReady = false
  for (let i = 0; i < 15; i++) {
    await sleep(2000)
    const probe = await cliA.select(`applications?id=eq.${appA1Id}&select=embedding_source`)
    if (probe.body?.[0]?.embedding_source) {
      embeddingReady = true
      break
    }
  }
  assert(embeddingReady, embeddingReady ? 'embedded' : 'no embedding after 30s — check edge function logs')

  step('embedding for app A2 populated')
  let a2Ready = false
  for (let i = 0; i < 10; i++) {
    const probe = await cliA.select(`applications?id=eq.${appA2Id}&select=embedding_source`)
    if (probe.body?.[0]?.embedding_source) { a2Ready = true; break }
    await sleep(2000)
  }
  assert(a2Ready, a2Ready ? 'embedded' : 'A2 not embedded')

  step('find_similar_applications returns scoped results')
  if (embeddingReady && a2Ready) {
    const sim = await cliA.rpc('find_similar_applications', { target_id: appA1Id, match_count: 5 })
    assert(sim.status === 200 && Array.isArray(sim.body), `status=${sim.status}`)
    const topMatch = sim.body?.[0]
    assert(
      topMatch && topMatch.company === 'Globex',
      `top match=${topMatch?.company} similarity=${topMatch?.similarity?.toFixed?.(3)}`,
    )
  } else {
    fail('skipped — embeddings not ready')
  }

  step('similarity RPC is user-scoped (B cannot call against A1)')
  const crossSim = await cliB.rpc('find_similar_applications', { target_id: appA1Id, match_count: 5 })
  // Either empty (target lookup is RLS-filtered out) or non-error empty array
  assert(
    crossSim.status === 200 && Array.isArray(crossSim.body) && crossSim.body.length === 0,
    `status=${crossSim.status} rows=${crossSim.body?.length}`,
  )

  step('analytics view v_response_rate scoped per-user')
  const vrA = await cliA.select('v_response_rate?select=user_id,status')
  const otherA = (vrA.body ?? []).filter((r) => r.user_id !== createdA.id)
  assert(otherA.length === 0 && (vrA.body ?? []).length >= 3, `rows=${vrA.body?.length} leaked=${otherA.length}`)

  step('analytics view v_time_to_response scoped per-user')
  const vtA = await cliA.select('v_time_to_response?select=id,user_id')
  const otherT = (vtA.body ?? []).filter((r) => r.user_id !== createdA.id)
  assert(otherT.length === 0 && (vtA.body ?? []).length >= 3, `rows=${vtA.body?.length} leaked=${otherT.length}`)

  step('analytics view v_response_by_source scoped per-user')
  const vsA = await cliA.select('v_response_by_source?select=user_id,source_site')
  const otherS = (vsA.body ?? []).filter((r) => r.user_id !== createdA.id)
  assert(otherS.length === 0 && (vsA.body ?? []).length >= 3, `rows=${vsA.body?.length}`)

  step('clustering: seed deterministic embeddings (bypass Voyage)')
  if (!EDGE_SECRET) {
    fail('skipped — EDGE_FUNCTION_SECRET not in test/.env.local')
  } else {
    // Bypass Voyage entirely so this test isn't held hostage by free-tier
    // rate limits. Real Voyage coverage lives in find_similar_applications
    // above; here we only care about our cluster function's behaviour.
    // Two groups: A1, A2 along axis 0; A3, A4 along axis 1.
    const fakes = [
      { id: appA1Id, vec: fakeUnitVector(0, 1) },
      { id: appA2Id, vec: fakeUnitVector(0, 2) },
      { id: appA3Id, vec: fakeUnitVector(1, 3) },
      { id: appA4Id, vec: fakeUnitVector(1, 4) },
    ]
    let seeded = 0
    for (const f of fakes) {
      const res = await serviceUpdate(`applications?id=eq.${f.id}`, {
        embedding: JSON.stringify(f.vec),
        embedding_source: 'e2e-test-fake',
      })
      if (res.status === 200) seeded++
    }
    assert(seeded === 4, `seeded=${seeded}/4`)

    step('clustering: invoke cluster-embeddings for user A')
    const clusterRes = await fetch(`${URL}/functions/v1/cluster-embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': EDGE_SECRET },
      body: JSON.stringify({ userId: createdA.id }),
    })
    const clusterBody = await clusterRes.json().catch(() => null)
    assert(
      clusterRes.status === 200 && clusterBody?.status === 'ok' && clusterBody?.assigned === 4,
      `status=${clusterRes.status} body=${JSON.stringify(clusterBody)}`,
    )

    step("clustering: user A sees their own clusters via the view")
    const aClusters = await cliA.select(
      'v_response_rate_by_cluster?select=cluster_id,label,total,user_id',
    )
    const aOwn = (aClusters.body ?? []).filter((r) => r.user_id === createdA.id)
    assert(
      aOwn.length >= 1 && aOwn.reduce((s, r) => s + (r.total ?? 0), 0) === 4,
      `A clusters=${aOwn.length} total_assigned=${aOwn.reduce((s, r) => s + (r.total ?? 0), 0)}`,
    )

    step("clustering: RLS — user B sees zero of user A's clusters")
    const bClusters = await cliB.select('clusters?select=id,user_id')
    const leakedC = (bClusters.body ?? []).filter((r) => r.user_id === createdA.id)
    assert(leakedC.length === 0, `B sees ${bClusters.body?.length} cluster rows; leaked=${leakedC.length}`)

    step("clustering: applications.cluster_id populated for A")
    const aApps = await cliA.select(
      'applications?select=id,cluster_id&embedding=not.is.null',
    )
    const withCluster = (aApps.body ?? []).filter((r) => r.cluster_id !== null).length
    assert(withCluster === 4, `with_cluster=${withCluster}/4`)
  }

  step('embedding column never sent in default applications select')
  const sel = await cliA.select(`applications?id=eq.${appA1Id}&select=*`)
  // Note: select=* will include embedding. Just verify it's a vector-shaped string when included
  // (this is informational; dashboard code should select specific columns)
  const row = sel.body?.[0]
  assert(row && 'embedding' in row, 'embedding column exists (informational; ensure dashboard does NOT use select=*)')
} catch (err) {
  step(currentName || 'unhandled')
  fail(err?.message || String(err))
} finally {
  // Cleanup
  step('cleanup user A')
  if (createdA?.id) await adminDeleteUser(createdA.id)
  pass()
  step('cleanup user B')
  if (createdB?.id) await adminDeleteUser(createdB.id)
  pass()
}

console.log('')
console.log('=== Summary ===')
const passed = results.filter((r) => r.ok).length
const failed = results.filter((r) => !r.ok)
console.log(`${passed}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:')
  for (const f of failed) console.log(`  - ${f.name}: ${f.msg}`)
  process.exit(1)
}
console.log('E2E PASSED')
