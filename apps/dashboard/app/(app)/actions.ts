'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { STATUSES, type Status } from '@trackwise/types'
import { createClient } from '@/lib/supabase/server'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function updateApplicationStatus(id: string, status: Status) {
  if (!STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`)
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('applications')
    .update({ status })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/')
}

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()

const createApplicationSchema = z.object({
  company: z.string().trim().min(1, 'Company is required').max(200),
  role: z.string().trim().min(1, 'Role is required').max(200),
  location: trimmedString(200).optional(),
  source_url: z
    .string()
    .trim()
    .max(2000)
    .url({ message: 'Must be a valid URL' })
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  source_site: trimmedString(50).optional(),
  notes: trimmedString(5000).optional(),
})

export type CreateApplicationState = {
  ok: boolean
  fieldErrors?: Record<string, string[]>
  formError?: string
}

export async function createApplication(
  _prev: CreateApplicationState,
  formData: FormData,
): Promise<CreateApplicationState> {
  const parsed = createApplicationSchema.safeParse({
    company: formData.get('company'),
    role: formData.get('role'),
    location: formData.get('location'),
    source_url: formData.get('source_url'),
    source_site: formData.get('source_site'),
    notes: formData.get('notes'),
  })

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, formError: 'Not authenticated' }
  }

  const { error } = await supabase.from('applications').insert({
    user_id: userData.user.id,
    company: parsed.data.company,
    role: parsed.data.role,
    location: parsed.data.location ?? null,
    source_url: parsed.data.source_url ?? null,
    source_site: parsed.data.source_site ?? 'manual',
    notes: parsed.data.notes ?? null,
  })

  if (error) {
    return { ok: false, formError: error.message }
  }

  revalidatePath('/')
  return { ok: true }
}
