'use client'

import { useActionState, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createApplication,
  type CreateApplicationState,
} from '@/app/(app)/actions'

const initialState: CreateApplicationState = { ok: false }

export function AddApplicationDialog() {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(
    async (prev: CreateApplicationState, formData: FormData) => {
      const next = await createApplication(prev, formData)
      if (next.ok) {
        formRef.current?.reset()
        setOpen(false)
      }
      return next
    },
    initialState,
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Add Job</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a job application</DialogTitle>
          <DialogDescription>
            Track a role you have applied to. Company and role are required.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <Field
            name="company"
            label="Company"
            required
            errors={state.fieldErrors?.company}
          />
          <Field
            name="role"
            label="Role"
            required
            errors={state.fieldErrors?.role}
          />
          <Field
            name="location"
            label="Location"
            errors={state.fieldErrors?.location}
          />
          <Field
            name="source_url"
            label="Source URL"
            type="url"
            placeholder="https://..."
            errors={state.fieldErrors?.source_url}
          />
          <Field
            name="source_site"
            label="Source site"
            placeholder="linkedin, indeed, manual..."
            errors={state.fieldErrors?.source_site}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} />
            {state.fieldErrors?.notes ? (
              <p className="text-sm text-destructive">
                {state.fieldErrors.notes.join(', ')}
              </p>
            ) : null}
          </div>
          {state.formError ? (
            <p className="text-sm text-destructive">{state.formError}</p>
          ) : null}
          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  name,
  label,
  type = 'text',
  required = false,
  placeholder,
  errors,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  placeholder?: string
  errors?: string[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input id={name} name={name} type={type} placeholder={placeholder} />
      {errors ? (
        <p className="text-sm text-destructive">{errors.join(', ')}</p>
      ) : null}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Save'}
    </Button>
  )
}
