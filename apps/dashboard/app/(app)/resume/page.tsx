import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ResumeForm } from './resume-form'

export const metadata: Metadata = {
  title: 'Resume — TrackWise',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function ResumePage() {
  const supabase = await createClient()
  const { data: resume } = await supabase
    .from('resumes')
    .select('id, label, content, updated_at, embedding, embedding_source')
    .eq('is_active', true)
    .maybeSingle()

  // "Ready" only when the stored embedding was generated from the
  // *current* content. After a content edit, the row still has the
  // previous embedding until the async trigger overwrites it.
  const hasEmbedding =
    resume?.embedding !== null &&
    resume?.embedding !== undefined &&
    resume?.embedding_source === resume?.content

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Resume</h1>
        <p className="text-sm text-muted-foreground">
          Paste your resume as plain text. We embed it once and use it to
          score how well each saved job matches your background.
        </p>
      </header>

      <ResumeForm
        initialLabel={resume?.label ?? ''}
        initialContent={resume?.content ?? ''}
      />

      {resume ? (
        <section className="space-y-1 text-xs text-muted-foreground">
          <p>Last updated: {formatDateTime(resume.updated_at)}</p>
          <p>
            Embedding:{' '}
            {hasEmbedding
              ? 'ready'
              : 'computing... refresh in a moment'}
          </p>
        </section>
      ) : null}
    </main>
  )
}
