'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  updateApplicationNotes,
  type UpdateNotesState,
} from '@/app/(app)/actions'

const initialState: UpdateNotesState = { ok: false }

export function NotesForm({
  applicationId,
  initialNotes,
}: {
  applicationId: string
  initialNotes: string | null
}) {
  const [savedValue, setSavedValue] = useState(initialNotes ?? '')
  const [value, setValue] = useState(initialNotes ?? '')

  const [state, formAction] = useActionState(
    async (prev: UpdateNotesState, formData: FormData) => {
      const submitted = (formData.get('notes') as string | null) ?? ''
      const next = await updateApplicationNotes(prev, formData)
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
        name="notes"
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add notes about this application..."
      />
      {state.fieldErrors?.notes ? (
        <p className="text-sm text-destructive">
          {state.fieldErrors.notes.join(', ')}
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
