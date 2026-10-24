import 'server-only'
import { createClient } from '@/lib/supabase/server'

// Daily Vercel cron (see vercel.json). Calls ping(), which writes to the
// keepalive table so Supabase sees database activity and doesn't pause the
// free-tier project. Vercel sends CRON_SECRET as a Bearer token; anything
// else gets a 401.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (
    !cronSecret ||
    request.headers.get('authorization') !== `Bearer ${cronSecret}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('ping')
  if (error) {
    throw new Error(`ping failed: ${error.message}`)
  }

  return Response.json({ ok: true })
}
