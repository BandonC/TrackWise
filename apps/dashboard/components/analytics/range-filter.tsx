'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  PRESET_LABELS,
  RANGE_STORAGE_KEY,
  formatCustomLabel,
  parseDateParam,
  parseRange,
  type Range,
} from '@/lib/analytics/range'

const PRESETS = ['30d', '90d', 'all'] as const

export function RangeFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = parseRange(searchParams.get('range') ?? undefined)
  const fromParam = searchParams.get('from') ?? undefined
  const toParam = searchParams.get('to') ?? undefined
  const fromDate = parseDateParam(fromParam)
  const toDate = parseDateParam(toParam)
  const customActive = current === 'custom' && fromDate && toDate

  const [open, setOpen] = useState(false)
  const [fromDraft, setFromDraft] = useState(fromParam ?? '')
  const [toDraft, setToDraft] = useState(toParam ?? '')
  const [error, setError] = useState<string | null>(null)

  function pushParams(next: URLSearchParams) {
    const query = next.toString()
    // Remember the selection for this session so returning to analytics via
    // the nav restores it instead of falling back to the 30d default.
    window.sessionStorage.setItem(RANGE_STORAGE_KEY, query)
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  function selectPreset(range: Exclude<Range, 'custom'>) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('from')
    params.delete('to')
    if (range === '30d') {
      params.delete('range')
    } else {
      params.set('range', range)
    }
    pushParams(params)
  }

  function applyCustom() {
    const from = parseDateParam(fromDraft)
    const to = parseDateParam(toDraft)
    if (!from || !to) {
      setError('Enter both From and To as YYYY-MM-DD.')
      return
    }
    if (from > to) {
      setError('From must be on or before To.')
      return
    }
    setError(null)
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', 'custom')
    params.set('from', fromDraft)
    params.set('to', toDraft)
    pushParams(params)
    setOpen(false)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-card p-1">
      {PRESETS.map((r) => (
        <Button
          key={r}
          variant={r === current ? 'default' : 'ghost'}
          size="sm"
          onClick={() => selectPreset(r)}
        >
          {PRESET_LABELS[r]}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={buttonVariants({
            variant: current === 'custom' ? 'default' : 'ghost',
            size: 'sm',
          })}
        >
          {customActive ? formatCustomLabel(fromDate, toDate) : 'Custom'}
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              applyCustom()
            }}
            className="grid gap-3"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="range-from">From</Label>
              <Input
                id="range-from"
                type="date"
                value={fromDraft}
                onChange={(e) => setFromDraft(e.target.value)}
                max={toDraft || undefined}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="range-to">To</Label>
              <Input
                id="range-to"
                type="date"
                value={toDraft}
                onChange={(e) => setToDraft(e.target.value)}
                min={fromDraft || undefined}
              />
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}
