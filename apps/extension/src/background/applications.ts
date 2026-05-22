import { supabase } from '../lib/supabase'
import type { ParsedJob } from '../lib/types'

// Field caps mirror the dashboard's zod schemas (createApplication,
// updateApplicationJobDescription). The parser pulls content directly
// from LinkedIn/Indeed DOM, which is third-party-controlled and could
// in principle return pathological lengths. Capping at the boundary
// prevents oversized rows from landing in the DB even if a malicious
// page tries it. Truncation is preferred over rejection because losing
// a save on a real job posting is worse than storing a clipped string.
const MAX_COMPANY_LEN = 200
const MAX_ROLE_LEN = 200
const MAX_LOCATION_LEN = 200
const MAX_SOURCE_URL_LEN = 2000
const MAX_SOURCE_SITE_LEN = 50
const MAX_NOTES_LEN = 5000
const MAX_JD_LEN = 10000

function cap(value: string | null, max: number): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

export async function saveApplication(payload: ParsedJob): Promise<{ id: string }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Not signed in')

  const company = cap(payload.company, MAX_COMPANY_LEN)
  const role = cap(payload.role, MAX_ROLE_LEN)
  if (!company) throw new Error('Missing company')
  if (!role) throw new Error('Missing role')

  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: sessionData.session.user.id,
      company,
      role,
      location: cap(payload.location, MAX_LOCATION_LEN),
      salary_min: payload.salary_min,
      salary_max: payload.salary_max,
      source_url: cap(payload.source_url, MAX_SOURCE_URL_LEN),
      source_site: cap(payload.source_site, MAX_SOURCE_SITE_LEN),
      notes: cap(payload.notes, MAX_NOTES_LEN),
      job_description: cap(payload.job_description, MAX_JD_LEN),
    })
    .select('id')
    .single()

  if (error) throw error
  return { id: data.id }
}

// Lightweight count for the popup's first-run onboarding.
// head:true + count:exact returns just the number, no rows.
export async function getApplicationCount(): Promise<number> {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Not signed in')

  const { count, error } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })

  if (error) throw error
  return count ?? 0
}
