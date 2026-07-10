import { createClient } from '@/lib/supabase/server'
import {
  ApplicationsList,
  type ApplicationRow,
} from '@/components/applications/applications-list'

export default async function ApplicationsListPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, company, role, location, status, source_site, applied_at, last_updated_at',
    )
    .order('applied_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">All applications</h1>
        <p className="text-sm text-muted-foreground">
          {data.length} {data.length === 1 ? 'application' : 'applications'}
        </p>
      </header>
      <ApplicationsList applications={data as ApplicationRow[]} />
    </main>
  )
}
