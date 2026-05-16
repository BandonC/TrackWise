import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { DeleteAccount } from './delete-account'

export const metadata: Metadata = {
  title: 'Settings — TrackWise',
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const email = data.user?.email ?? null

  return (
    <main className="mx-auto w-full max-w-2xl space-y-10 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Account</h2>
        <p className="text-sm">
          Signed in as <span className="font-medium">{email}</span>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Legal</h2>
        <p className="text-sm">
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
        </p>
      </section>

      <section className="space-y-3 rounded-md border border-destructive/40 p-4">
        <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and all associated data. This
          cannot be undone.
        </p>
        <DeleteAccount />
      </section>
    </main>
  )
}
