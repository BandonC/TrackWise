// Mirrors the CHECK constraint on applications.status. Keep in sync with
// supabase/migrations/20260508200516_initial_schema.sql — changing one
// requires changing the other in the same commit.
export const STATUSES = [
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
] as const

export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
}
