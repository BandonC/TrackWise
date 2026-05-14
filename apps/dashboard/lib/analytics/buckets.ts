export type HistogramBucket = {
  label: string
  min: number
  max: number | null
  count: number
}

const BUCKET_DEFS: ReadonlyArray<{ label: string; min: number; max: number | null }> = [
  { label: '0–1d', min: 0, max: 1 },
  { label: '1–3d', min: 1, max: 3 },
  { label: '3–7d', min: 3, max: 7 },
  { label: '7–14d', min: 7, max: 14 },
  { label: '14d+', min: 14, max: null },
]

export function bucketize(days: number[]): HistogramBucket[] {
  return BUCKET_DEFS.map((def) => ({
    ...def,
    count: days.filter(
      (d) => d >= def.min && (def.max === null || d < def.max)
    ).length,
  }))
}
