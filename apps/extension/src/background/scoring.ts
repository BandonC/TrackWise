import { supabase } from '../lib/supabase'
import type { ScorePayload, ScoreResult } from '../lib/types'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
// Keying includes the userId so signing out of account A and into B on
// the same Chrome profile cannot return A's cached scores. The history
// match in particular contains A's application IDs, which would resolve
// to nothing for B -- a real cross-account leak before this change.
export const CACHE_PREFIX = 'fit:'

function cacheKey(userId: string, url: string): string {
  return `${CACHE_PREFIX}${userId}:${url}`
}

type CacheEntry = { savedAt: number; result: ScoreResult }

async function readCache(
  userId: string,
  url: string,
): Promise<ScoreResult | null> {
  const key = cacheKey(userId, url)
  const stored = await chrome.storage.local.get(key)
  const entry = stored[key] as CacheEntry | undefined
  if (!entry) return null
  if (Date.now() - entry.savedAt > CACHE_TTL_MS) {
    await chrome.storage.local.remove(key)
    return null
  }
  return entry.result
}

async function writeCache(
  userId: string,
  url: string,
  result: ScoreResult,
): Promise<void> {
  const key = cacheKey(userId, url)
  const entry: CacheEntry = { savedAt: Date.now(), result }
  await chrome.storage.local.set({ [key]: entry })
}

// Called from auth.signOut so a sign-out tidies up the previous user's
// entries. Without this, orphan keys accumulate under userIds that will
// never sign in on this profile again (e.g. after account deletion).
export async function clearFitCache(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const toRemove = Object.keys(all).filter((k) => k.startsWith(CACHE_PREFIX))
  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove)
  }
}

export async function scoreCurrentPage(
  payload: ScorePayload,
): Promise<ScoreResult> {
  if (!payload.role || !payload.company) {
    throw new Error('Missing role or company')
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Not signed in')
  const userId = sessionData.session.user.id

  const cached = await readCache(userId, payload.url)
  if (cached) return cached

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

  await writeCache(userId, payload.url, data)
  return data
}
