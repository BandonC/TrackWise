'use client'

import { useState, useTransition } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { recomputeClusters, type RecomputeResult } from '@/app/(app)/analytics/actions'
import { ClusterRateChart, type ClusterDatum } from './cluster-rate-chart'

export function RecomputeClustersCard({
  data,
  lastComputedAt,
}: {
  data: ClusterDatum[]
  lastComputedAt: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [lastResult, setLastResult] = useState<RecomputeResult | null>(null)

  const onRecompute = () => {
    setLastResult(null)
    startTransition(async () => {
      const result = await recomputeClusters()
      setLastResult(result)
    })
  }

  const computed = lastComputedAt ? new Date(lastComputedAt) : null
  const relative = computed
    ? `Computed ${formatDistanceToNow(computed, { addSuffix: true })}`
    : 'Never computed'
  // Locale-deterministic format so SSR and client hydration match;
  // toLocaleString() picks the runtime's default locale, which differs
  // between Node and the browser.
  const absolute = computed ? format(computed, 'PPpp') : ''

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Response rate by cluster</CardTitle>
            <CardDescription>
              Groups of similar applications, by response rate
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              onClick={onRecompute}
              disabled={pending}
            >
              {pending ? 'Recomputing…' : 'Recompute'}
            </Button>
            <span
              className="text-xs text-muted-foreground"
              title={absolute}
            >
              {relative}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ClusterRateChart data={data} />
        {lastResult && (
          <p
            className={`mt-3 text-xs ${
              lastResult.ok ? 'text-muted-foreground' : 'text-destructive'
            }`}
            role="status"
          >
            {formatResult(lastResult)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function formatResult(r: RecomputeResult): string {
  if (!r.ok) {
    return `Recompute failed (${r.error}). Try again in a moment.`
  }
  if ('skipped' in r) {
    return `Not enough applications with embeddings to cluster yet (${r.n} of 4 needed).`
  }
  return `Recomputed: ${r.clusters} clusters across ${r.assigned} applications.`
}
