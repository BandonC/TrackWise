'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { HistogramBucket } from '@/lib/analytics/buckets'

const config = {
  count: { label: 'Responses', color: 'var(--primary)' },
} satisfies ChartConfig

export function TimeHistogram({ buckets }: { buckets: HistogramBucket[] }) {
  const total = buckets.reduce((sum, b) => sum + b.count, 0)
  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No data yet
      </div>
    )
  }

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart accessibilityLayer data={buckets} margin={{ left: 8, right: 16 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
