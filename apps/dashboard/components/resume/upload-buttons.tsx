'use client'

import { useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  extractDocxText,
  extractPdfText,
  ResumeParseError,
} from '@/lib/parse-resume'

type Kind = 'pdf' | 'docx'

export function ResumeUploadButtons({
  hasContent,
  onExtracted,
}: {
  hasContent: boolean
  onExtracted: (text: string) => void
}) {
  const pdfInput = useRef<HTMLInputElement>(null)
  const docxInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ kind: Kind; file: File } | null>(
    null,
  )

  async function runExtraction(kind: Kind, file: File): Promise<void> {
    setBusy(kind)
    setError(null)
    try {
      const text =
        kind === 'pdf' ? await extractPdfText(file) : await extractDocxText(file)
      onExtracted(text)
    } catch (err) {
      const message =
        err instanceof ResumeParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Upload failed.'
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  function onFilePicked(kind: Kind, file: File) {
    if (hasContent) {
      setPending({ kind, file })
    } else {
      void runExtraction(kind, file)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = '' // Reset so the same file re-fires.
            if (f) onFilePicked('pdf', f)
          }}
        />
        <input
          ref={docxInput}
          type="file"
          accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) onFilePicked('docx', f)
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => pdfInput.current?.click()}
        >
          {busy === 'pdf' ? 'Reading PDF...' : 'Upload PDF'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => docxInput.current?.click()}
        >
          {busy === 'docx' ? 'Reading DOCX...' : 'Upload DOCX'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Or paste below. Max 5MB.
        </span>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing resume?</AlertDialogTitle>
            <AlertDialogDescription>
              Your resume already has content. The uploaded file will
              replace it. You can review the result before saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pending) return
                const { kind, file } = pending
                setPending(null)
                void runExtraction(kind, file)
              }}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
