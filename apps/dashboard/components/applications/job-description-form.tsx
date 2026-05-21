'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  updateApplicationJobDescription,
  type UpdateJobDescriptionState,
} from '@/app/(app)/actions'

const initialState: UpdateJobDescriptionState = { ok: false }

export function JobDescriptionForm({
  applicationId,
  initialJobDescription,
}: {
  applicationId: string
  initialJobDescription: string | null
}) {
  const [savedValue, setSavedValue] = useState(initialJobDescription ?? '')
  const [value, setValue] = useState(initialJobDescription ?? '')

  const [state, formAction] = useActionState(
    async (prev: UpdateJobDescriptionState, formData: FormData) => {
      const submitted =
        (formData.get('job_description') as string | null) ?? ''
      const next = await updateApplicationJobDescription(prev, formData)
      if (next.ok) setSavedValue(submitted)
      return next
    },
    initialState,
  )

  const dirty = value !== savedValue

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={applicationId} />
      <Textarea
        name="job_description"
        rows={8}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste the job description here. Saving re-scores the resume fit using the JD as context."
      />
      {state.fieldErrors?.job_description ? (
        <p className="text-sm text-destructive">
          {state.fieldErrors.job_description.join(', ')}
        </p>
      ) : null}
      {state.formError ? (
        <p className="text-sm text-destructive">{state.formError}</p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        {state.ok && !dirty ? (
          <span className="text-xs text-muted-foreground">Saved</span>
        ) : null}
        <SubmitButton disabled={!dirty} />
      </div>
    </form>
  )
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? 'Saving...' : 'Save'}
    </Button>
  )
}
