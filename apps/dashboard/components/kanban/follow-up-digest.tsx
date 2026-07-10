import Link from 'next/link'
import { STATUS_LABELS, type Status } from '@trackwise/types'
import { isStale } from '@/lib/applications/stale'

// Warm threads worth a nudge: a live conversation past the interview stage
// that has gone quiet. Applied, screening, and rejected are excluded — before
// real human contact a nudge is premature or unlikely to help; only from the
// interview onward does a follow-up reliably move things.
const FOLLOWUP_STATUSES: Status[] = ['interview', 'offer']
const MAX_SHOWN = 5

type Row = {
  id: string
  company: string
  status: string
  last_updated_at: string
}

function isFollowUpStatus(status: string): status is Status {
  return (FOLLOWUP_STATUSES as string[]).includes(status)
}

function selectFollowUps(
  applications: Row[],
  now: number = Date.now(),
): (Row & { status: Status })[] {
  return applications
    .filter(
      (r): r is Row & { status: Status } =>
        isFollowUpStatus(r.status) && isStale(r.last_updated_at, now),
    )
    .sort(
      (a, b) =>
        new Date(a.last_updated_at).getTime() -
        new Date(b.last_updated_at).getTime(),
    )
}

export function FollowUpDigest({ applications }: { applications: Row[] }) {
  const items = selectFollowUps(applications)

  if (items.length === 0) return null

  const shown = items.slice(0, MAX_SHOWN)
  const extra = items.length - shown.length

  return (
    <p className="mb-6 text-xs text-muted-foreground">
      <span className="font-medium">Worth a follow-up:</span>{' '}
      {shown.map((r, i) => (
        <span key={r.id}>
          {i > 0 ? ' · ' : ''}
          <Link
            href={`/applications/${r.id}`}
            className="text-foreground underline-offset-2 hover:underline"
          >
            {r.company}
          </Link>{' '}
          — {STATUS_LABELS[r.status]}
        </span>
      ))}
      {extra > 0 ? ` · +${extra} more` : ''}
    </p>
  )
}
