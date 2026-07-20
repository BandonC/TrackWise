import type { Metadata } from 'next'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { LocalDate } from '@/components/local-date'
import { createClient } from '@/lib/supabase/server'
import { ResumeForm } from './resume-form'

export const metadata: Metadata = {
  title: 'Resume — TrackWise',
}

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
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
        <h1 className="font-heading text-2xl font-semibold">Resume</h1>
        <p className="text-sm text-muted-foreground">
          Paste your resume as plain text. We embed it once and use it to
          score how well each saved job matches your background.
        </p>
      </header>

      <Card>
        <CardContent>
          <ResumeForm
            initialLabel={resume?.label ?? ''}
            initialContent={resume?.content ?? ''}
          />
        </CardContent>
      </Card>

      {resume ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-foreground',
              hasEmbedding ? 'bg-status-offer/10' : 'bg-status-interview/10',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                hasEmbedding ? 'bg-status-offer' : 'bg-status-interview',
              )}
            />
            {hasEmbedding ? 'Embedded' : 'Processing'}
          </span>
          <span>
            Updated <LocalDate iso={resume.updated_at} options={DATETIME_OPTS} />
          </span>
          {!hasEmbedding ? <span>Refresh in a moment.</span> : null}
        </div>
      ) : null}
    </main>
  )
}
