export const PRESET_RANGES = ['30d', '90d', 'all', 'custom'] as const
export type Range = (typeof PRESET_RANGES)[number]

export const PRESET_LABELS: Record<Exclude<Range, 'custom'>, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
}

export function parseRange(value: string | undefined): Range {
  return (PRESET_RANGES as readonly string[]).includes(value ?? '')
    ? (value as Range)
    : '30d'
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function parseDateParam(value: string | undefined): Date | null {
  if (!value || !DATE_PATTERN.test(value)) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDateParam(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const DISPLAY_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function formatCustomLabel(from: Date, to: Date): string {
  return `${DISPLAY_FMT.format(from)} – ${DISPLAY_FMT.format(to)}`
}

export type ResolvedWindow = {
  current: { startISO: string | null; endISO: string | null }
  prior: { startISO: string; endISO: string } | null
  label: string
}

export function resolveWindow(
  range: Range,
  fromParam?: string,
  toParam?: string,
  now: Date = new Date(),
): ResolvedWindow {
  if (range === 'all') {
    return {
      current: { startISO: null, endISO: null },
      prior: null,
      label: PRESET_LABELS.all,
    }
  }

  if (range === 'custom') {
    const from = parseDateParam(fromParam)
    const to = parseDateParam(toParam)
    if (from && to && from <= to) {
      const endExclusive = new Date(to.getTime() + 86_400_000)
      const windowMs = endExclusive.getTime() - from.getTime()
      return {
        current: {
          startISO: from.toISOString(),
          endISO: endExclusive.toISOString(),
        },
        prior: {
          startISO: new Date(from.getTime() - windowMs).toISOString(),
          endISO: from.toISOString(),
        },
        label: formatCustomLabel(from, to),
      }
    }
    return resolveWindow('30d', undefined, undefined, now)
  }

  const days = range === '30d' ? 30 : 90
  const ms = days * 86_400_000
  const start = new Date(now.getTime() - ms)
  const priorStart = new Date(now.getTime() - 2 * ms)
  return {
    current: { startISO: start.toISOString(), endISO: null },
    prior: {
      startISO: priorStart.toISOString(),
      endISO: start.toISOString(),
    },
    label: PRESET_LABELS[range],
  }
}
