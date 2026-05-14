'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { STATUSES, STATUS_LABELS, type Status } from '@trackwise/types'

export type FunnelDatum = { status: Status; count: number }

const config = {
  count: { label: 'Applications', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function FunnelChart({ data }: { data: FunnelDatum[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0)
  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No data yet
      </div>
    )
  }

  const rows = STATUSES.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: data.find((d) => d.status === status)?.count ?? 0,
  }))

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 16 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
