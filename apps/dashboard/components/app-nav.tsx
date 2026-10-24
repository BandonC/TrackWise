'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ChartColumn,
  FileText,
  List,
  ListChecks,
  LogOut,
  Settings,
  SquareKanban,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { RANGE_STORAGE_KEY } from '@/lib/analytics/range'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { signOut } from '@/app/(app)/actions'

const LINKS = [
  { href: '/', label: 'Applications', icon: SquareKanban },
  { href: '/applications', label: 'List', icon: List },
  { href: '/analytics', label: 'Analytics', icon: ChartColumn },
  { href: '/resume', label: 'Resume', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
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
    // Top bar on mobile, fixed-height sidebar from md up.
    <nav className="sticky top-0 z-10 flex items-center gap-4 border-b bg-sidebar px-4 py-3 text-sidebar-foreground md:h-svh md:w-56 md:shrink-0 md:flex-col md:items-stretch md:gap-6 md:border-r md:border-b-0 md:px-3 md:py-4">
      <Link
        href="/"
        className="flex items-center gap-2 font-heading text-base font-semibold md:px-2"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ListChecks className="size-4" />
        </span>
        <span className="hidden sm:inline">TrackWise</span>
      </Link>
      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm md:flex-col md:items-stretch md:overflow-visible">
        {LINKS.map((link) => {
          const active = isActive(link.href)
          const href = link.href === '/analytics' ? analyticsHref : link.href
          const Icon = link.icon
          return (
            <li key={link.href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 font-medium whitespace-nowrap transition-colors md:py-2',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <Icon className="hidden size-4 md:block" />
                {link.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center gap-1 md:border-t md:pt-3">
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
