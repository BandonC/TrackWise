import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@trackwise/types'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Build the redirect response up front so cookies set during the code
  // exchange land on the response the browser actually receives.
  const response = NextResponse.redirect(`${origin}/`)

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // Diagnostic — surface the underlying error so we can see why the
    // exchange is failing in production. Revert after debugging.
    console.error('auth/callback exchangeCodeForSession failed', error)
    const detail = encodeURIComponent(error.message)
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed&detail=${detail}`,
    )
  }

  return response
}
