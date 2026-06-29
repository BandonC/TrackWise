import Link from 'next/link'
import { ListChecks, MousePointerClick, Sparkles, LineChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { signInWithGoogle } from './actions'

type SearchParams = Promise<{ deleted?: string; error?: string }>

const FEATURES = [
  {
    icon: MousePointerClick,
    text: 'Save jobs in one click from LinkedIn and Indeed',
  },
  {
    icon: Sparkles,
    text: 'See how your resume fits every posting',
  },
  {
    icon: LineChart,
    text: 'Learn which sources actually respond',
  },
] as const

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { deleted, error } = await searchParams

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 px-6 py-12">
      <div className="w-full max-w-md">
        {deleted === '1' && (
          <p
            role="status"
            className="mb-4 rounded-md border border-border bg-muted px-4 py-2 text-sm text-muted-foreground"
          >
            Your account and all associated data have been deleted.
          </p>
        )}
        {error === 'oauth_failed' && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            Sign-in failed. Please try again.
          </p>
        )}

        <div className="rounded-2xl bg-card p-8 shadow-lg ring-1 ring-foreground/10">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ListChecks className="size-5" />
            </div>
            <span className="font-heading text-lg font-semibold tracking-tight">
              TrackWise
            </span>
          </div>

          <h1 className="mt-6 font-heading text-2xl font-semibold leading-tight tracking-tight">
            Your whole job search, in one place.
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Track every application. Learn from every response.
          </p>

          <form className="mt-6" action={signInWithGoogle}>
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full gap-2 text-base"
            >
              <GoogleIcon />
              Continue with Google
            </Button>
          </form>
          <p className="mt-3 text-sm text-muted-foreground">
            No password required — we use Google sign-in.
          </p>

          <div className="my-6 border-t" />

          <FeatureList />
        </div>
      </div>

      <BoardPreview className="w-full max-w-3xl" />

      <footer className="text-center text-sm text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy Policy
        </Link>
      </footer>
    </main>
  )
}

const PREVIEW_COLUMNS = [
  {
    label: 'Applied',
    dot: 'bg-status-applied',
    cards: [
      { company: 'Northwind Labs', role: 'Senior Frontend Engineer' },
      { company: 'Acme Cloud', role: 'Product Designer' },
    ],
  },
  {
    label: 'Interview',
    dot: 'bg-status-interview',
    cards: [
      { company: 'Globex', role: 'Backend Engineer' },
      { company: 'Initech', role: 'Data Analyst' },
    ],
  },
  {
    label: 'Offer',
    dot: 'bg-status-offer',
    cards: [{ company: 'Hooli', role: 'Full Stack Engineer' }],
  },
] as const

function BoardPreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'overflow-hidden rounded-xl bg-card shadow-xl ring-1 ring-foreground/10',
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b bg-background/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ListChecks className="size-3" />
          </div>
          <span className="text-xs font-semibold">TrackWise</span>
        </div>
        <div className="flex gap-1 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5 text-foreground">
            Applications
          </span>
          <span className="px-2 py-0.5">Analytics</span>
          <span className="px-2 py-0.5">Resume</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 bg-background p-4">
        {PREVIEW_COLUMNS.map((col) => (
          <div
            key={col.label}
            className="rounded-lg bg-muted/40 ring-1 ring-foreground/5"
          >
            <div className="flex items-center justify-between border-b px-2.5 py-2">
              <div className="flex items-center gap-1.5">
                <span className={cn('size-2 rounded-full', col.dot)} />
                <span className="text-xs font-medium">{col.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {col.cards.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-2.5">
              {col.cards.map((c) => (
                <div
                  key={c.company}
                  className="rounded-md bg-card p-2.5 ring-1 ring-foreground/10"
                >
                  <div className="text-xs font-medium leading-tight">
                    {c.company}
                  </div>
                  <div className="text-xs text-muted-foreground">{c.role}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeatureList({ className }: { className?: string }) {
  return (
    <ul className={cn('grid gap-3', className)}>
      {FEATURES.map(({ icon: Icon, text }) => (
        <li
          key={text}
          className="flex items-center gap-3 text-base text-foreground"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <Icon className="size-4.5" />
          </span>
          {text}
        </li>
      ))}
    </ul>
  )
}

// Google's official brand mark. The four brand colors are required by
// Google's sign-in branding guidelines, so they're intentionally
// hardcoded here rather than drawn from our design tokens.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}
