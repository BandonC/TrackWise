import Link from 'next/link'
import { notFound } from 'next/navigation'
import { STATUS_LABELS, type Status } from '@trackwise/types'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { NotesForm } from '@/components/applications/notes-form'

type PageProps = { params: Promise<{ id: string }> }

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
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

function formatSalary(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—'
  const fmt = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`
  if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`
  return fmt((min ?? max) as number)
}

function similarityBand(
  similarity: number,
): { label: string; visible: boolean } {
  if (similarity >= 0.85) return { label: 'Very Similar', visible: true }
  if (similarity >= 0.7) return { label: 'Similar', visible: true }
  return { label: '', visible: false }
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: application, error } = await supabase
    .from('applications')
    .select(
      'id, company, role, location, salary_min, salary_max, source_url, source_site, status, applied_at, last_updated_at, notes',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!application) notFound()

  const status = application.status as Status

  const [{ data: events }, { data: similar }, { data: fitRows }, { data: anyResume }] =
    await Promise.all([
      supabase
        .from('application_events')
        .select('id, event_type, from_status, to_status, created_at')
        .eq('application_id', id)
        .order('created_at', { ascending: true }),
      supabase.rpc('find_similar_applications', {
        target_id: id,
        match_count: 5,
      }),
      supabase.rpc('resume_fit_for_application', { application_id: id }),
      supabase
        .from('resumes')
        .select('id, embedding')
        .eq('is_active', true)
        .maybeSingle(),
    ])

  const visibleSimilar = (similar ?? []).filter(
    (s) => similarityBand(s.similarity).visible,
  )
  const fit = fitRows?.[0] ?? null

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href="/"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to board
      </Link>

      <header className="mb-6">
        <div className="mb-1 text-sm text-muted-foreground">
          {application.company}
        </div>
        <h1 className="font-heading text-2xl font-semibold leading-tight">
          {application.role}
        </h1>
        <div className="mt-3 inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {STATUS_LABELS[status]}
        </div>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
        <Field label="Location" value={application.location ?? '—'} />
        <Field
          label="Salary"
          value={formatSalary(application.salary_min, application.salary_max)}
        />
        <Field
          label="Source"
          value={
            application.source_url ? (
              <a
                href={application.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                {application.source_site ?? 'link'}
              </a>
            ) : (
              (application.source_site ?? '—')
            )
          }
        />
        <Field label="Applied" value={formatDate(application.applied_at)} />
        <Field
          label="Last updated"
          value={formatDate(application.last_updated_at)}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-heading text-sm font-medium text-muted-foreground">
          Notes
        </h2>
        <NotesForm
          key={application.id}
          applicationId={application.id}
          initialNotes={application.notes}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-heading text-sm font-medium text-muted-foreground">
          History
        </h2>
        {events && events.length > 0 ? (
          <ol className="space-y-2 text-sm">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex items-baseline justify-between gap-4 border-b border-border/50 pb-2 last:border-0"
              >
                <span>
                  {ev.event_type === 'created'
                    ? 'Created'
                    : ev.event_type === 'status_change'
                      ? `${STATUS_LABELS[ev.from_status as Status] ?? ev.from_status} → ${STATUS_LABELS[ev.to_status as Status] ?? ev.to_status}`
                      : ev.event_type}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(ev.created_at)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-heading text-sm font-medium text-muted-foreground">
          Resume fit
        </h2>
        <ResumeFitCard
          fit={fit}
          hasActiveResume={Boolean(anyResume)}
          resumeEmbeddingReady={Boolean(anyResume?.embedding)}
        />
      </section>

      <section>
        <h2 className="mb-3 font-heading text-sm font-medium text-muted-foreground">
          Similar applications
        </h2>
        {visibleSimilar.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No similar applications found yet. Embeddings populate
            asynchronously after saving — check back in a moment if this
            application was just created.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visibleSimilar.map((s) => {
              const band = similarityBand(s.similarity)
              return (
                <li key={s.id}>
                  <Link href={`/applications/${s.id}`} className="block">
                    <Card size="sm" className="transition hover:bg-muted/40">
                      <CardHeader>
                        <CardDescription>{s.company}</CardDescription>
                        <CardTitle className="text-base">{s.role}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between text-xs">
                          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                            {band.label}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {(s.similarity * 100).toFixed(0)}%
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}

function Field({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  )
}

function ResumeFitCard({
  fit,
  hasActiveResume,
  resumeEmbeddingReady,
}: {
  fit: { resume_label: string; similarity: number } | null
  hasActiveResume: boolean
  resumeEmbeddingReady: boolean
}) {
  if (!hasActiveResume) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center justify-between gap-4 text-sm">
          <span className="text-muted-foreground">
            No resume on file yet.
          </span>
          <Link
            href="/resume"
            className="font-medium underline-offset-2 hover:underline"
          >
            Add your resume →
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (!resumeEmbeddingReady || !fit) {
    return (
      <Card size="sm">
        <CardContent className="text-sm text-muted-foreground">
          Computing fit... embeddings populate asynchronously. Refresh in a
          moment.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm">
      <CardContent className="flex items-center justify-between gap-4">
        <div>
          <div className="font-heading text-xl font-semibold tabular-nums">
            {(fit.similarity * 100).toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground">
            vs &ldquo;{fit.resume_label}&rdquo;
          </div>
        </div>
        <Link
          href="/resume"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Edit resume
        </Link>
      </CardContent>
    </Card>
  )
}
