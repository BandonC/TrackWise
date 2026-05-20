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
    .select('id, label, content, updated_at, embedding_source')
    .eq('is_active', true)
    .maybeSingle()

  // "Ready" only when the active chunk set was generated from the
  // *current* content. The chunking Edge Function stamps
  // embedding_source as `voyage-3-chunked:${trimmed-content}` after
  // a successful re-chunk; if it doesn't match, the user edited the
  // text and the async trigger hasn't repopulated yet.
  const hasEmbedding =
    resume?.embedding_source ===
    `voyage-3-chunked:${resume?.content?.trim() ?? ''}`

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
