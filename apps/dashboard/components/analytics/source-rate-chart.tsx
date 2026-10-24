'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export type SourceDatum = {
  source: string
  total: number
  responded: number
  rate: number | null
}

const config = {
  rate: { label: 'Response rate', color: 'var(--primary)' },
} satisfies ChartConfig

export function SourceRateChart({ data }: { data: SourceDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No data yet
      </div>
    )
  }

  const rows = data.map((d) => {
    const rate = d.rate === null ? 0 : Math.round(d.rate * 1000) / 10
    return {
      source: d.source,
      rate,
      total: d.total,
      responded: d.responded,
      // Printed at the bar's end so a 0% source reads as a result, not a
      // missing bar.
      label: `${rate}% (${d.responded}/${d.total})`,
    }
  })

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 80 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="source"
          tickLine={false}
          axisLine={false}
          width={80}
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
        {/* Recharts skips zero-value bars (and their labels) by default. */}
        <Bar
          dataKey="rate"
          fill="var(--color-rate)"
          radius={4}
          minPointSize={3}
        >
          <LabelList
            dataKey="label"
            position="right"
            className="fill-muted-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
