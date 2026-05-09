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
  }

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/login?error=auth_failed`)
}
