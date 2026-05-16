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

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.EDGE_FUNCTION_SECRET
  if (!baseUrl || !secret) {
    console.error('recomputeClusters: missing env config')
    return { ok: false, error: 'misconfigured' }
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/functions/v1/cluster-embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify({ userId: user.id }),
    })
  } catch (e) {
    console.error('recomputeClusters: fetch failed', e)
    return { ok: false, error: 'network' }
  }

  if (!res.ok) {
    console.error('recomputeClusters: edge function status', res.status)
    return { ok: false, error: `edge_${res.status}` }
  }

  const payload = (await res.json()) as
    | { status: 'ok'; clusters: number; assigned: number }
    | { status: 'skipped'; reason: 'not_enough_data'; n: number }

  revalidatePath('/analytics')

  if (payload.status === 'skipped') {
    return { ok: true, skipped: payload.reason, n: payload.n }
  }
  return { ok: true, clusters: payload.clusters, assigned: payload.assigned }
}
