'use client'

import { useMounted } from '@/lib/use-mounted'

type LocalDateProps = {
  iso: string | null
  options: Intl.DateTimeFormatOptions
  fallback?: string
}

// Renders a stored UTC timestamp in the viewer's local timezone. The server
// runs in UTC, so to avoid a hydration mismatch the first paint formats in
// UTC (matching the server) and re-formats in local time once mounted.
export function LocalDate({ iso, options, fallback = '—' }: LocalDateProps) {
  const mounted = useMounted()
  if (!iso) return <>{fallback}</>
  const text = new Date(iso).toLocaleString(
    undefined,
    mounted ? options : { ...options, timeZone: 'UTC' },
  )
  return <span suppressHydrationWarning>{text}</span>
}
