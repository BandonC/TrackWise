'use client'

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { STATUSES, STATUS_LABELS, type Status } from '@trackwise/types'

export type FunnelDatum = { status: Status; count: number }

const STATUS_FILL: Record<Status, string> = {
  applied: 'var(--status-applied)',
  screening: 'var(--status-screening)',
  interview: 'var(--status-interview)',
  offer: 'var(--status-offer)',
  rejected: 'var(--status-rejected)',
}

const config = {
  count: { label: 'Applications', color: 'var(--primary)' },
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
        <Bar dataKey="count" radius={4}>
          {rows.map((row) => (
            <Cell key={row.status} fill={STATUS_FILL[row.status]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
