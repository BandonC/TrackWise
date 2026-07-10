export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

export function isStale(lastUpdatedAt: string, now: number): boolean {
  return now - new Date(lastUpdatedAt).getTime() > STALE_THRESHOLD_MS
}
