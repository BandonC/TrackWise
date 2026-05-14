'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'

const LINKS = [
  { href: '/', label: 'Applications' },
  { href: '/analytics', label: 'Analytics' },
] as const

export function AppNav() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-3">
        <Link href="/" className="font-heading text-base font-semibold">
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
                    'rounded-md px-3 py-1.5 transition-colors',
                    active
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
        <ThemeToggle />
      </div>
    </nav>
  )
}
