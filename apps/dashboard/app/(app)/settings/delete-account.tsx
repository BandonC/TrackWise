'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAccount } from './actions'

const CONFIRM_PHRASE = 'delete my account'

export function DeleteAccount() {
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const matches = confirmText.trim().toLowerCase() === CONFIRM_PHRASE

  function onSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteAccount()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete account')
      }
    })
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive">Delete account</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently removes your account, every saved application,
            and every status-change event. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-delete">
            Type{' '}
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono font-semibold text-destructive">
              {CONFIRM_PHRASE}
            </span>{' '}
            to confirm.
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            }
          />
          <Button
            variant="destructive"
            disabled={!matches || pending}
            onClick={onSubmit}
          >
            {pending ? 'Deleting…' : 'Delete account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
