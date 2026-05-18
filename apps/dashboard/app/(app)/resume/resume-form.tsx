'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveResume, type SaveResumeState } from '@/app/(app)/actions'

const initialState: SaveResumeState = { ok: false }

export function ResumeForm({
  initialLabel,
  initialContent,
}: {
  initialLabel: string
  initialContent: string
}) {
  const [label, setLabel] = useState(initialLabel)
  const [content, setContent] = useState(initialContent)
  const [savedLabel, setSavedLabel] = useState(initialLabel)
  const [savedContent, setSavedContent] = useState(initialContent)

  const [state, formAction] = useActionState(
    async (prev: SaveResumeState, formData: FormData) => {
      // Form submission converts textarea \n to \r\n (RFC 2046). The
      // textarea's controlled state stays as \n, so we normalize the
      // submitted value to match — otherwise the dirty check stays
      // permanently true and the save button never disables.
      const submittedLabel = (
        (formData.get('label') as string | null) ?? ''
      ).replace(/\r\n/g, '\n')
      const submittedContent = (
        (formData.get('content') as string | null) ?? ''
      ).replace(/\r\n/g, '\n')
      const next = await saveResume(prev, formData)
      if (next.ok) {
        setSavedLabel(submittedLabel)
        setSavedContent(submittedContent)
      }
      return next
    },
    initialState,
  )

  const dirty = label !== savedLabel || content !== savedContent

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resume-label">Label</Label>
        <Input
          id="resume-label"
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="My resume"
        />
        {state.fieldErrors?.label ? (
          <p className="text-sm text-destructive">
            {state.fieldErrors.label.join(', ')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resume-content">Content</Label>
        <Textarea
          id="resume-content"
          name="content"
          rows={20}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your resume here..."
        />
        {state.fieldErrors?.content ? (
          <p className="text-sm text-destructive">
            {state.fieldErrors.content.join(', ')}
          </p>
        ) : null}
      </div>

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
    <Button type="submit" disabled={disabled || pending}>
      {pending ? 'Saving...' : 'Save resume'}
    </Button>
  )
}
