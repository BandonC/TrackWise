import Link from 'next/link'
import type { Metadata } from 'next'
import { User, Database, Shield, TriangleAlert, Download } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
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
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <header>
        <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          Signed in as <span className="font-medium">{email}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            Your data
          </CardTitle>
          <CardDescription>
            Download all of your applications as a CSV file, including notes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/applications/export"
            download
            className={buttonVariants({ variant: 'outline' })}
          >
            <Download className="size-4" />
            Export as CSV
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-4 text-muted-foreground" />
            Legal
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Privacy Policy
          </Link>
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="size-4" />
            Danger zone
          </CardTitle>
          <CardDescription>
            Permanently delete your account and all associated data. This
            cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccount />
        </CardContent>
      </Card>
    </main>
  )
}
