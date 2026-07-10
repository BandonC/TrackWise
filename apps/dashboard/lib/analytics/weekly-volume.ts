export type VolumeBucket = {
  weekStart: string
  label: string
  count: number
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const LABEL_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

// Snap a timestamp back to the start of its UTC week (Monday 00:00 UTC).
// UTC keeps the +WEEK_MS loop DST-safe and matches the range filter, which is
// also UTC-based.
function startOfUtcWeek(ms: number): number {
  const d = new Date(ms)
  const daysFromMonday = (d.getUTCDay() + 6) % 7
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysFromMonday,
  )
}

// Bucket applications into contiguous weekly counts across the active window.
// Empty weeks are kept as zero-count buckets so a lull reads as a dip, not a
// gap. Rows are assumed already filtered to the window by the caller; the
// bounds here just define the bucket range (and the start for the all-time
// case, where startISO is null).
export function weeklyVolume(
  rows: { applied_at: string | null }[],
  startISO: string | null,
  endISO: string | null,
  now: number = Date.now(),
): VolumeBucket[] {
  const times = rows
    .map((r) => (r.applied_at ? new Date(r.applied_at).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))

  const end = endISO ? new Date(endISO).getTime() : now
  let start: number
  if (startISO) {
    start = new Date(startISO).getTime()
  } else if (times.length > 0) {
    start = Math.min(...times)
  } else {
    return []
  }

  const firstWeek = startOfUtcWeek(start)
  const lastWeek = startOfUtcWeek(end)

  const buckets: VolumeBucket[] = []
  for (let w = firstWeek; w <= lastWeek; w += WEEK_MS) {
    buckets.push({
      weekStart: new Date(w).toISOString(),
      label: LABEL_FMT.format(new Date(w)),
      count: 0,
    })
  }

  for (const t of times) {
    const idx = Math.floor((startOfUtcWeek(t) - firstWeek) / WEEK_MS)
    if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1
  }

  return buckets
}
