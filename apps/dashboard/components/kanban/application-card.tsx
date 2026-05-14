'use client'

import { useDraggable } from '@dnd-kit/core'
import type { Status } from '@trackwise/types'
import { Card, CardContent } from '@/components/ui/card'

export type KanbanApplication = {
  id: string
  company: string
  role: string
  applied_at: string
  last_updated_at: string
  status: Status
}

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

function isStale(lastUpdatedAt: string, now: number): boolean {
  return now - new Date(lastUpdatedAt).getTime() > STALE_THRESHOLD_MS
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function ApplicationCard({
  application,
  now,
}: {
  application: KanbanApplication
  now: number
}) {
  const stale = isStale(application.last_updated_at, now)
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: application.id,
      data: { fromStatus: application.status },
    })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? 'opacity-50' : ''}`}
    >
      <Card size="sm" className="cursor-grab active:cursor-grabbing">
        <CardContent className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <div className="font-heading text-sm font-medium leading-snug">
              {application.company}
            </div>
            {stale ? (
              <span
                aria-label="No updates in over a week"
                title="No updates in over a week"
                className="mt-1 inline-block size-2 shrink-0 rounded-full bg-destructive"
              />
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">
            {application.role}
          </div>
          <div className="text-xs text-muted-foreground">
            Applied {formatDate(application.applied_at)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
