import Link from 'next/link'
import { signInWithGoogle } from './actions'

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">TrackWise</h1>
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
