'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { STATUSES, STATUS_LABELS, type Status } from '@trackwise/types'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const STATUS_DOT: Record<Status, string> = {
  applied: 'bg-status-applied',
  screening: 'bg-status-screening',
  interview: 'bg-status-interview',
  offer: 'bg-status-offer',
  rejected: 'bg-status-rejected',
}

const STATUS_TINT: Record<Status, string> = {
  applied: 'bg-status-applied/10',
  screening: 'bg-status-screening/10',
  interview: 'bg-status-interview/10',
  offer: 'bg-status-offer/10',
  rejected: 'bg-status-rejected/10',
}

const STATUS_BORDER: Record<Status, string> = {
  applied: 'border-status-applied/40',
  screening: 'border-status-screening/40',
  interview: 'border-status-interview/40',
  offer: 'border-status-offer/40',
  rejected: 'border-status-rejected/40',
}

export type ApplicationRow = {
  id: string
  company: string
  role: string
  location: string | null
  status: string
  source_site: string | null
  applied_at: string
  last_updated_at: string
}

type SortKey = 'company' | 'applied_at' | 'last_updated_at'
type SortDir = 'asc' | 'desc'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_TINT[status],
      )}
    >
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}) {
  const isActive = sortKey === col
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        {isActive ? (
          sortDir === 'asc' ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )
        ) : null}
      </button>
    </th>
  )
}

export function ApplicationsList({
  applications,
}: {
  applications: ApplicationRow[]
}) {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<Set<Status>>(new Set(STATUSES))
  const [sortKey, setSortKey] = useState<SortKey>('applied_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleStatus(status: Status) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'company' ? 'asc' : 'desc')
    }
  }

  if (applications.length === 0) {
    return (
      <p className="rounded-lg border border-border/60 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        No applications yet.
      </p>
    )
  }

  const query = search.trim().toLowerCase()
  const filtered = applications
    .filter((a) => active.has(a.status as Status))
    .filter((a) => {
      if (!query) return true
      return (
        a.company.toLowerCase().includes(query) ||
        a.role.toLowerCase().includes(query) ||
        (a.location?.toLowerCase().includes(query) ?? false)
      )
    })

  const sorted = [...filtered].sort((a, b) => {
    const cmp =
      sortKey === 'company'
        ? a.company.localeCompare(b.company)
        : new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime()
    return sortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          placeholder="Search company, role, or location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">
            Status
          </span>
          {STATUSES.map((status) => {
            const on = active.has(status)
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={on}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  on
                    ? cn(STATUS_TINT[status], STATUS_BORDER[status], 'text-foreground')
                    : 'border-border text-muted-foreground opacity-70 hover:bg-muted hover:opacity-100',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    on ? STATUS_DOT[status] : 'bg-muted-foreground/40',
                  )}
                />
                {STATUS_LABELS[status]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <SortHeader
                label="Company"
                col="company"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <SortHeader
                label="Applied"
                col="applied_at"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
              <SortHeader
                label="Updated"
                col="last_updated_at"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No applications match your filters.
                </td>
              </tr>
            ) : (
              sorted.map((a) => (
                <tr
                  key={a.id}
                  className="border-b last:border-0 hover:bg-muted/40"
                >
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`/applications/${a.id}?from=list`}
                      className="hover:underline"
                    >
                      {a.company}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{a.role}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={a.status as Status} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDate(a.applied_at)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDate(a.last_updated_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {sorted.length} of {applications.length}
      </p>
    </div>
  )
}
