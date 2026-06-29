'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export type ClusterDatum = {
  cluster_id: string
  label: string
  total: number
  responded: number
  rate: number | null
}

const config = {
  rate: { label: 'Response rate', color: 'var(--primary)' },
} satisfies ChartConfig

export function ClusterRateChart({ data }: { data: ClusterDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No clusters yet
      </div>
    )
  }

  const rows = data.map((d) => ({
    label: d.label,
    rate: d.rate === null ? 0 : Math.round(d.rate * 1000) / 10,
    total: d.total,
    responded: d.responded,
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
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={160}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const r = item.payload as (typeof rows)[number]
                return `${value}% (${r.responded}/${r.total})`
              }}
            />
          }
        />
        <Bar dataKey="rate" fill="var(--color-rate)" radius={4} />
      </BarChart>
    </ChartContainer>
  )
}
