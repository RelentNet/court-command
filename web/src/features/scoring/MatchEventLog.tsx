// web/src/features/scoring/MatchEventLog.tsx
import { useMemo } from 'react'
import { Square } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Skeleton } from '../../components/Skeleton'
import {
  EVENT_META,
  formatEventTime,
  summarizeEvent,
} from './EventsTimeline'
import { useMatchEvents } from './hooks'

export interface MatchEventLogProps {
  publicId: string
  className?: string
  /** Caps the visible list; older events scroll off. Defaults to all. */
  maxHeightClassName?: string
}

/**
 * MatchEventLog — a compact, scrollable, newest-first feed of a match's events,
 * sized for the referee console side panel. Reuses the shared `useMatchEvents`
 * query (same cache key the scoring mutations + VerbalsPanel invalidate, so it
 * stays live) and the EVENT_META icon/label map from EventsTimeline.
 *
 * Unlike EventsTimeline (the full match-detail view with filters and payload
 * inspection) this is a glanceable rail: icon, label, optional one-line
 * summary, and a timestamp.
 */
export function MatchEventLog({
  publicId,
  className,
  maxHeightClassName = 'max-h-[60vh]',
}: MatchEventLogProps) {
  const eventsQuery = useMatchEvents(publicId)

  const events = useMemo(() => {
    const data = eventsQuery.data ?? []
    // Newest first.
    return [...data].sort((a, b) => b.sequence_id - a.sequence_id)
  }, [eventsQuery.data])

  return (
    <section
      className={cn(
        'flex flex-col rounded-lg border border-(--color-border) bg-(--color-bg-secondary)',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 p-3 border-b border-(--color-border) shrink-0">
        <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide">
          Event log
        </h2>
        {events.length > 0 && (
          <span className="text-xs text-(--color-text-muted) tabular-nums">
            {events.length}
          </span>
        )}
      </header>

      {eventsQuery.isLoading ? (
        <div className="p-3 space-y-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : eventsQuery.isError ? (
        <div className="p-4 text-center text-sm text-(--color-error)">
          Failed to load events.{' '}
          <button
            type="button"
            onClick={() => eventsQuery.refetch()}
            className="underline"
          >
            Retry
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="p-4 text-center text-sm text-(--color-text-secondary)">
          No events yet.
        </div>
      ) : (
        <ul
          className={cn('overflow-y-auto divide-y divide-(--color-border)', maxHeightClassName)}
        >
          {events.map((e) => {
            const meta = EVENT_META[e.event_type]
            const Icon = meta?.icon.Icon ?? Square
            const summary = summarizeEvent(e)
            return (
              <li
                key={e.id}
                className="flex items-start gap-2.5 px-3 py-2"
              >
                <span
                  className={cn(
                    'shrink-0 mt-0.5',
                    meta?.icon.color ?? 'text-(--color-text-secondary)',
                  )}
                >
                  <Icon size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-(--color-text-primary) truncate">
                      {meta?.label ?? e.event_type}
                    </span>
                    <span className="shrink-0 text-xs text-(--color-text-muted) tabular-nums">
                      {formatEventTime(e.timestamp)}
                    </span>
                  </span>
                  {summary && (
                    <span className="block text-xs text-(--color-text-secondary) truncate">
                      {summary}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
