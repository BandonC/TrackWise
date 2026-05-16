import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/`)
    }
    // Diagnostic — surface the underlying error so we can see why the
    // exchange fails in production. Revert after launch-prep debugging.
    console.error('auth/callback exchangeCodeForSession failed', error)
    const detail = encodeURIComponent(error.message)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/login?error=auth_failed&detail=${detail}`,
    )
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/login?error=auth_failed&detail=no_code`)
}
