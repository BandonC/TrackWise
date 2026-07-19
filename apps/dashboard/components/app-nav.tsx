'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ListChecks, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RANGE_STORAGE_KEY } from '@/lib/analytics/range'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/(app)/actions'

const LINKS = [
  { href: '/', label: 'Applications' },
  { href: '/applications', label: 'List' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/resume', label: 'Resume' },
  { href: '/settings', label: 'Settings' },
] as const

// sessionStorage isn't a subscribable store; navigation re-renders this nav
// (usePathname/useSearchParams change), and getSnapshot re-reads on each
// render, so the Analytics link stays current without a storage listener.
const noopSubscribe = () => () => {}

export function AppNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Detail pages (/applications/[id]) are reachable from both the board
  // and the list, so the highlight follows the origin passed via ?from.
  const isDetail =
    pathname.startsWith('/applications/') && pathname !== '/applications'
  const from = searchParams.get('from')

  const isActive = (href: string): boolean => {
    if (isDetail) {
      return from === 'list' ? href === '/applications' : href === '/'
    }
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // Restore the last analytics range within the session (resets on tab
  // close). Server render and first paint use the bare path to match SSR.
  const analyticsHref = useSyncExternalStore(
    noopSubscribe,
    () => {
      const saved = window.sessionStorage.getItem(RANGE_STORAGE_KEY)
      return saved ? `/analytics?${saved}` : '/analytics'
    },
    () => '/analytics',
  )

  return (
    <nav className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading text-base font-semibold"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ListChecks className="size-4" />
          </span>
          TrackWise
        </Link>
        <ul className="flex flex-1 items-center gap-1 text-sm">
          {LINKS.map((link) => {
            const active = isActive(link.href)
            const href = link.href === '/analytics' ? analyticsHref : link.href
            return (
              <li key={link.href}>
                <Link
                  href={href}
                  className={cn(
                    'rounded-md px-3 py-1.5 font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
        <ThemeToggle />
        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </nav>
  )
}
