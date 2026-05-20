import { supabase } from '../lib/supabase'
import type { ScorePayload, ScoreResult } from '../lib/types'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const CACHE_PREFIX = 'fit:'

type CacheEntry = { savedAt: number; result: ScoreResult }

async function readCache(url: string): Promise<ScoreResult | null> {
  const key = CACHE_PREFIX + url
  const stored = await chrome.storage.local.get(key)
  const entry = stored[key] as CacheEntry | undefined
  if (!entry) return null
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
    await chrome.storage.local.remove(key)
    return null
  }
  return entry.result
}

async function writeCache(url: string, result: ScoreResult): Promise<void> {
  const key = CACHE_PREFIX + url
  const entry: CacheEntry = { savedAt: Date.now(), result }
  await chrome.storage.local.set({ [key]: entry })
}

export async function scoreCurrentPage(
  payload: ScorePayload,
): Promise<ScoreResult> {
  if (!payload.role || !payload.company) {
    throw new Error('Missing role or company')
  }

  const cached = await readCache(payload.url)
  if (cached) return cached

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Not signed in')

  const { data, error } = await supabase.functions.invoke<ScoreResult>(
    'score-external-job',
    {
      body: {
        role: payload.role,
        company: payload.company,
        notes: payload.notes ?? '',
        job_description: payload.job_description ?? '',
      },
    },
  )

  if (error) throw error
  if (!data) throw new Error('Empty response')

  await writeCache(payload.url, data)
  return data
}
