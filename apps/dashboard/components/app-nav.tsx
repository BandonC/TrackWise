'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ListChecks, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
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

export function AppNav() {
  const pathname = usePathname()

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
            const active =
              link.href === '/'
                ? pathname === '/'
                : pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
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
