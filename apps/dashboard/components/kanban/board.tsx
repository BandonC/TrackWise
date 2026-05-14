'use client'

import { useOptimistic, useTransition } from 'react'
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { STATUSES, STATUS_LABELS, type Status } from '@trackwise/types'
import { updateApplicationStatus } from '@/app/(app)/actions'
import {
  ApplicationCard,
  type KanbanApplication,
} from './application-card'

export type GroupedApplications = Record<Status, KanbanApplication[]>

type Move = { id: string; fromStatus: Status; toStatus: Status }

function applyMove(
  state: GroupedApplications,
  move: Move,
): GroupedApplications {
  const moved = state[move.fromStatus].find((a) => a.id === move.id)
  if (!moved) return state
  return {
    ...state,
    [move.fromStatus]: state[move.fromStatus].filter(
      (a) => a.id !== move.id,
    ),
    [move.toStatus]: [
      { ...moved, status: move.toStatus },
      ...state[move.toStatus],
    ],
  }
}

export function KanbanBoard({
  grouped,
  now,
}: {
  grouped: GroupedApplications
  now: number
}) {
  const [optimistic, addMove] = useOptimistic(grouped, applyMove)
  const [, startTransition] = useTransition()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function onDragEnd(event: DragEndEvent) {
    const fromStatus = event.active.data.current?.fromStatus as
      | Status
      | undefined
    const toStatus = event.over?.data.current?.status as Status | undefined
    if (!fromStatus || !toStatus || fromStatus === toStatus) return

    const id = String(event.active.id)
    startTransition(async () => {
      addMove({ id, fromStatus, toStatus })
      try {
        await updateApplicationStatus(id, toStatus)
      } catch (error) {
        console.error('Failed to update application status', error)
      }
    })
  }

  return (
    <DndContext id="kanban" sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        {STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            applications={optimistic[status]}
            now={now}
          />
        ))}
      </div>
    </DndContext>
  )
}

function KanbanColumn({
  status,
  applications,
  now,
}: {
  status: Status
  applications: KanbanApplication[]
  now: number
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { status },
  })

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-32 flex-col overflow-hidden rounded-xl bg-muted/40 ring-1 transition-colors ${
        isOver ? 'ring-foreground/40 bg-muted/70' : 'ring-foreground/5'
      }`}
    >
      <header className="flex items-center justify-between border-b bg-muted px-3 py-2">
        <h2 className="font-heading text-sm font-medium">
          {STATUS_LABELS[status]}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {applications.length}
        </span>
      </header>
      <div className="flex flex-col gap-2 p-3">
        {applications.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            None
          </p>
        ) : (
          applications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              now={now}
            />
          ))
        )}
      </div>
    </section>
  )
}
