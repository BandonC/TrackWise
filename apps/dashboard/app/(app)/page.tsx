import { STATUSES, type Status } from '@trackwise/types'
import { createClient } from '@/lib/supabase/server'
import {
  KanbanBoard,
  type GroupedApplications,
} from '@/components/kanban/board'
import { AddApplicationDialog } from '@/components/kanban/add-application-dialog'

function emptyGroups(): GroupedApplications {
  const groups = {} as GroupedApplications
  for (const s of STATUSES) groups[s] = []
  return groups
}

export default async function ApplicationsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('applications')
    .select('id, company, role, status, applied_at, last_updated_at')
    .order('applied_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  const grouped = emptyGroups()
  for (const row of data) {
    const status = row.status as Status
    if (!STATUSES.includes(status)) continue
    grouped[status].push({ ...row, status })
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <h1 className="font-heading text-2xl font-semibold">Applications</h1>
          <p className="text-sm text-muted-foreground">
            {data.length} {data.length === 1 ? 'application' : 'applications'}
          </p>
        </div>
        <AddApplicationDialog />
      </header>
      <KanbanBoard grouped={grouped} now={Date.now()} />
    </main>
  )
}
