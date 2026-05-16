import Link from 'next/link'
import { signInWithGoogle } from './actions'

type SearchParams = Promise<{ deleted?: string; error?: string }>

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { deleted, error } = await searchParams

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">TrackWise</h1>
      {deleted === '1' && (
        <p
          role="status"
          className="mt-6 rounded-md border border-border bg-muted px-4 py-2 text-sm text-muted-foreground"
        >
          Your account and all associated data have been deleted.
        </p>
      )}
      {error === 'oauth_failed' && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          Sign-in failed. Please try again.
        </p>
      )}
      <form action={signInWithGoogle} className="mt-8">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Sign in with Google
        </button>
      </form>
      <footer className="mt-12 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy Policy
        </Link>
      </footer>
    </main>
  )
}
