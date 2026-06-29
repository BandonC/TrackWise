import { STATUSES, type Status } from '@trackwise/types'
import { createClient } from '@/lib/supabase/server'
import { RangeFilter } from '@/components/analytics/range-filter'
import { FunnelChart, type FunnelDatum } from '@/components/analytics/funnel-chart'
import { TimeHistogram } from '@/components/analytics/time-histogram'
import {
  SourceRateChart,
  type SourceDatum,
} from '@/components/analytics/source-rate-chart'
import { RecomputeClustersCard } from '@/components/analytics/recompute-clusters-card'
import type { ClusterDatum } from '@/components/analytics/cluster-rate-chart'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { parseRange, resolveWindow, type Range } from '@/lib/analytics/range'
import { bucketize } from '@/lib/analytics/buckets'

type RateRow = { status: string | null; applied_at: string | null }
type SourceRow = RateRow & { source_site: string | null }
type TimeRow = { days_to_response: number | null }

type Aggregates = { total: number; responded: number; rate: number | null }

function aggregate(rows: RateRow[]): Aggregates {
  const total = rows.length
  const responded = rows.filter((r) => r.status && r.status !== 'applied').length
  const rate = total === 0 ? null : responded / total
  return { total, responded, rate }
}

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`
}

function formatDelta(current: number | null, prior: number | null): string {
  if (current === null || prior === null) return '—'
  const delta = (current - prior) * 100
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)} pts vs prior period`
}

function countByStatus(rows: RateRow[]): FunnelDatum[] {
  const counts = new Map<Status, number>()
  for (const s of STATUSES) counts.set(s, 0)
  for (const r of rows) {
    if (r.status && (STATUSES as readonly string[]).includes(r.status)) {
      const s = r.status as Status
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
  }
  return STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }))
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const { range: rangeParam, from: fromParam, to: toParam } = await searchParams
  const range: Range = parseRange(rangeParam)
  const { current: window, prior, label } = resolveWindow(
    range,
    fromParam,
    toParam,
  )

  const supabase = await createClient()

  let rateQuery = supabase.from('v_response_rate').select('status, applied_at')
  if (window.startISO) rateQuery = rateQuery.gte('applied_at', window.startISO)
  if (window.endISO) rateQuery = rateQuery.lt('applied_at', window.endISO)
  const currentRate = await rateQuery
  if (currentRate.error) throw new Error(currentRate.error.message)

  let priorAggregates: Aggregates | null = null
  if (prior) {
    const priorRate = await supabase
      .from('v_response_rate')
      .select('status, applied_at')
      .gte('applied_at', prior.startISO)
      .lt('applied_at', prior.endISO)
    if (priorRate.error) throw new Error(priorRate.error.message)
    priorAggregates = aggregate(priorRate.data as RateRow[])
  }

  let sourceQuery = supabase
    .from('v_response_by_source')
    .select('source_site, status, applied_at')
  if (window.startISO) sourceQuery = sourceQuery.gte('applied_at', window.startISO)
  if (window.endISO) sourceQuery = sourceQuery.lt('applied_at', window.endISO)
  const sourceRows = await sourceQuery
  if (sourceRows.error) throw new Error(sourceRows.error.message)

  let timeQuery = supabase
    .from('v_time_to_response')
    .select('days_to_response, applied_at')
  if (window.startISO) timeQuery = timeQuery.gte('applied_at', window.startISO)
  if (window.endISO) timeQuery = timeQuery.lt('applied_at', window.endISO)
  const timeRows = await timeQuery
  if (timeRows.error) throw new Error(timeRows.error.message)

  const rateRows = currentRate.data as RateRow[]
  const current = aggregate(rateRows)
  const funnelData = countByStatus(rateRows)

  const bySource = new Map<string, RateRow[]>()
  for (const row of sourceRows.data as SourceRow[]) {
    const key = row.source_site ?? 'unknown'
    const list = bySource.get(key) ?? []
    list.push({ status: row.status, applied_at: row.applied_at })
    bySource.set(key, list)
  }
  const sourceData: SourceDatum[] = [...bySource.entries()]
    .map(([source, rows]) => ({ source, ...aggregate(rows) }))
    .sort((a, b) => b.total - a.total)

  const responseDays = (timeRows.data as TimeRow[])
    .map((r) => r.days_to_response)
    .filter((d): d is number => d !== null)
  const histogram = bucketize(responseDays)

  const clusterRows = await supabase
    .from('v_response_rate_by_cluster')
    .select('cluster_id, label, total, responded, rate, computed_at')
    .order('total', { ascending: false })
  if (clusterRows.error) throw new Error(clusterRows.error.message)

  type ClusterRow = ClusterDatum & { computed_at: string | null }
  const clusters = (clusterRows.data ?? []) as ClusterRow[]
  const clusterData: ClusterDatum[] = clusters.map(
    ({ cluster_id, label, total, responded, rate }) => ({
      cluster_id,
      label,
      total,
      responded,
      rate,
    }),
  )
  const lastComputedAt =
    clusters.length > 0
      ? clusters.reduce<string | null>(
          (max, c) =>
            c.computed_at && (!max || c.computed_at > max) ? c.computed_at : max,
          null,
        )
      : null

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <RangeFilter />
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Response rate</CardTitle>
            <CardDescription>
              Share of applications that moved past Applied
            </CardDescription>
          </CardHeader>
          <CardContent>
            {current.total === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <>
                <p className="text-3xl font-semibold">
                  {formatRate(current.rate)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {current.responded} of {current.total}{' '}
                  {current.total === 1 ? 'application' : 'applications'}
                </p>
                {priorAggregates && priorAggregates.total > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDelta(current.rate, priorAggregates.rate)}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Funnel by status</CardTitle>
            <CardDescription>
              Applications at each stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelChart data={funnelData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Time to first response</CardTitle>
            <CardDescription>
              {responseDays.length === 0
                ? 'No responses yet'
                : `Avg ${(
                    responseDays.reduce((a, b) => a + b, 0) /
                    responseDays.length
                  ).toFixed(1)} days across ${responseDays.length} ${
                    responseDays.length === 1 ? 'response' : 'responses'
                  }`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimeHistogram buckets={histogram} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Response rate by source</CardTitle>
            <CardDescription>
              Where applications convert best
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SourceRateChart data={sourceData} />
          </CardContent>
        </Card>
      </section>

      <section className="mt-4">
        <RecomputeClustersCard
          data={clusterData}
          lastComputedAt={lastComputedAt}
        />
      </section>
    </main>
  )
}
