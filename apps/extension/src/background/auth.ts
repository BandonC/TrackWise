import { supabase } from '../lib/supabase'
import { clearFitCache } from './scoring'

export type AuthUser = { id: string; email: string | null }

export async function signInWithGoogle(): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: chrome.identity.getRedirectURL(),
      skipBrowserRedirect: true,
    },
  })
  if (error) throw error
  if (!data.url) throw new Error('Supabase did not return an OAuth URL')

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: data.url,
    interactive: true,
  })
  if (!responseUrl) throw new Error('Auth flow returned no response URL')

  const code = new URL(responseUrl).searchParams.get('code')
  if (!code) throw new Error('Auth response did not contain an authorization code')

  const { data: sessionData, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) throw exchangeError
  if (!sessionData.user) throw new Error('Code exchange did not return a user')

  return { id: sessionData.user.id, email: sessionData.user.email ?? null }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  // Tidy up the just-signed-out user's cached scores so storage doesn't
  // accumulate orphan entries across sign-in/sign-out cycles.
  await clearFitCache()
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!data.session) return null
  return { id: data.session.user.id, email: data.session.user.email ?? null }
}
