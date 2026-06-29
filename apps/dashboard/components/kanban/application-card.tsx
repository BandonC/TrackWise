'use client'

import { useRef } from 'react'
import Link from 'next/link'
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
// Must match PointerSensor activationConstraint.distance in board.tsx.
const DRAG_THRESHOLD_PX = 5

function isStale(lastUpdatedAt: string, now: number): boolean {
  return now - new Date(lastUpdatedAt).getTime() > STALE_THRESHOLD_MS
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function CardBody({
  application,
  now,
}: {
  application: KanbanApplication
  now: number
}) {
  const stale = isStale(application.last_updated_at, now)
  return (
    <Card
      size="sm"
      className="cursor-grab transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
    >
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
  )
}

export function ApplicationCard({
  application,
  now,
}: {
  application: KanbanApplication
  now: number
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: application.id,
    data: { fromStatus: application.status },
  })

  // Suppress the link click when the user actually dragged the card.
  // Records the pointer-down position and compares against the click
  // position; anything past the dnd-kit activation threshold is a drag,
  // not a click.
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  function onPointerDownCapture(e: React.PointerEvent) {
    pointerStart.current = { x: e.clientX, y: e.clientY }
  }

  function onClickCapture(e: React.MouseEvent) {
    const start = pointerStart.current
    pointerStart.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDownCapture={onPointerDownCapture}
      onClickCapture={onClickCapture}
      className={`touch-none ${isDragging ? 'opacity-40' : ''}`}
    >
      <Link href={`/applications/${application.id}`} className="block">
        <CardBody application={application} now={now} />
      </Link>
    </div>
  )
}

// Rendered inside DndContext's DragOverlay (portaled to <body>).
// No useDraggable, no Link — purely visual.
export function ApplicationCardPreview({
  application,
  now,
}: {
  application: KanbanApplication
  now: number
}) {
  return (
    <div className="cursor-grabbing">
      <CardBody application={application} now={now} />
    </div>
  )
}
