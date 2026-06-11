'use server'

import 'server-only'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type RecomputeResult =
  | { ok: true; clusters: number; assigned: number }
  | { ok: true; skipped: 'not_enough_data'; n: number }
  | { ok: false; error: string }

export async function recomputeClusters(): Promise<RecomputeResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  // invoke() forwards the user's session JWT; the function derives the
  // user from it, so no body is needed.
  const { data: payload, error } = await supabase.functions.invoke<
    | { status: 'ok'; clusters: number; assigned: number }
    | { status: 'skipped'; reason: 'not_enough_data'; n: number }
  >('cluster-embeddings')

  if (error || !payload) {
    console.error('recomputeClusters: invoke failed', error)
    return { ok: false, error: 'edge_error' }
  }

  revalidatePath('/analytics')

  if (payload.status === 'skipped') {
    return { ok: true, skipped: payload.reason, n: payload.n }
  }
  return { ok: true, clusters: payload.clusters, assigned: payload.assigned }
}
