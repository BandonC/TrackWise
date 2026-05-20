import { supabase } from '../lib/supabase'
import type { ParsedJob } from '../lib/types'

export async function saveApplication(payload: ParsedJob): Promise<{ id: string }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!sessionData.session) throw new Error('Not signed in')

  if (!payload.company) throw new Error('Missing company')
  if (!payload.role) throw new Error('Missing role')

  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: sessionData.session.user.id,
      company: payload.company,
      role: payload.role,
      location: payload.location,
      salary_min: payload.salary_min,
      salary_max: payload.salary_max,
      source_url: payload.source_url,
      source_site: payload.source_site,
      notes: payload.notes,
      job_description: payload.job_description,
    })
    .select('id')
    .single()

  if (error) throw error
  return { id: data.id }
}
