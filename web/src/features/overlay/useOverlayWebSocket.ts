// web/src/features/overlay/useOverlayWebSocket.ts
//
// Live overlay subscription. Multiplexes up to three WebSocket
// channels (overlay, court, optional match) into a single React hook
// and merges incoming events into the TanStack Query cache so any
// renderer using `useOverlayData` / `useOverlayConfig` picks up
// updates automatically.
//
// Channels served by api/ws/handler.go:
//   /ws/overlay/{courtID}  — config_update, overlay_data
//   /ws/court/{courtID}    — court state + match_update on that court
//   /ws/match/{publicID}   — per-match scoring events (optional)
//
// Wire envelope matches api/pubsub/pubsub.go Message:
//   { type: string, channel: string, data: unknown }
//
// Reconnect strategy mirrors Phase 3's useMatchWebSocket: exponential
// backoff 1s → 30s, cleared on successful open, suppressed on unmount.
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Match } from '../scoring/types'
import type { CourtOverlayConfig, OverlayData } from './types'

export type OverlayWSState = 'connecting' | 'open' | 'disconnected'

interface OverlayWSMessage {
  type: string
  channel?: string
  data: unknown
}

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000]

function wsBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = (import.meta.env.VITE_WS_URL as string | undefined) || ''
  if (base) return base.replace(/\/$/, '')
  return `${proto}//${window.location.host}`
}

interface OverlaySocketSpec {
  /** Short label for diagnostics, e.g. "overlay", "court", "match". */
  label: string
  url: string
}

interface UseOverlayWebSocketOptions {
  /** Disable all sockets (useful for preview panes). */
  enabled?: boolean
  /** Optional match public ID to subscribe to per-match scoring events. */
  matchPublicID?: string | null
  /** Called for every parsed message; passive — cache merging happens first. */
  onMessage?: (msg: OverlayWSMessage) => void
}

export interface UseOverlayWebSocketResult {
  /** Aggregate state: 'open' if all channels open, else worst state. */
  state: OverlayWSState
  /** Reconnect attempts since the last aggregate open. */
  attempt: number
  /** Wall-clock ms of the last message received on any channel. */
  lastMessageAt: number | null
}

/**
 * Subscribes to overlay + court (+ optional match) channels and merges
 * incoming events into the query cache so `useOverlayData` and
 * `useOverlayConfig` transparently reflect live state.
 */
export function useOverlayWebSocket(
  courtID: number | null | undefined,
  opts: UseOverlayWebSocketOptions = {},
): UseOverlayWebSocketResult {
  const qc = useQueryClient()
  const { enabled = true, matchPublicID = null, onMessage } = opts

  const [state, setState] = useState<OverlayWSState>('connecting')
  const [attempt, setAttempt] = useState(0)
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)

  const stateRef = useRef<Record<string, OverlayWSState>>({})
  const socketsRef = useRef<Record<string, WebSocket>>({})
  const attemptsRef = useRef<Record<string, number>>({})
  const timersRef = useRef<Record<string, number>>({})
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (!enabled || courtID == null || courtID <= 0) {
      setState('disconnected')
      return
    }
    // Per-run cancellation. A single shared ref would be reset to false by
    // the next effect run before the previous run's sockets fire their
    // (asynchronous) onclose, letting a torn-down run reschedule connect()
    // for the stale court/match and pollute the new run's state. Capturing
    // the flag in the effect closure ties it to this run only.
    let cancelled = false
    // Fresh per-run maps so a late onclose from a previous run can't mutate
    // the new run's live socket/state/timer entries (same label keys).
    stateRef.current = {}
    socketsRef.current = {}
    attemptsRef.current = {}
    timersRef.current = {}

    const specs: OverlaySocketSpec[] = [
      { label: 'overlay', url: `${wsBaseUrl()}/ws/overlay/${courtID}` },
      { label: 'court', url: `${wsBaseUrl()}/ws/court/${courtID}` },
    ]
    if (matchPublicID) {
      specs.push({
        label: 'match',
        url: `${wsBaseUrl()}/ws/match/${matchPublicID}`,
      })
    }

    const computeAggregate = () => {
      const labels = specs.map((s) => s.label)
      const states = labels.map((l) => stateRef.current[l] ?? 'connecting')
      let next: OverlayWSState = 'open'
      if (states.some((s) => s === 'disconnected')) next = 'disconnected'
      else if (states.some((s) => s === 'connecting')) next = 'connecting'
      setState(next)
      const maxAttempts = Math.max(
        ...labels.map((l) => attemptsRef.current[l] ?? 0),
        0,
      )
      setAttempt(maxAttempts)
    }

    const connect = (spec: OverlaySocketSpec) => {
      stateRef.current[spec.label] = 'connecting'
      computeAggregate()

      const ws = new WebSocket(spec.url)
      socketsRef.current[spec.label] = ws

      ws.onopen = () => {
        attemptsRef.current[spec.label] = 0
        stateRef.current[spec.label] = 'open'
        computeAggregate()
        // Re-fetch on reconnect so the consumer catches missed events.
        if (spec.label === 'overlay') {
          qc.invalidateQueries({ queryKey: ['overlay', 'config', courtID] })
          qc.invalidateQueries({ queryKey: ['overlay', 'data', courtID] })
        }
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as OverlayWSMessage
          applyMessage(qc, courtID, msg)
          setLastMessageAt(Date.now())
          onMessageRef.current?.(msg)
        } catch {
          // Ignore malformed
        }
      }

      ws.onerror = () => {
        // onclose will follow
      }

      ws.onclose = () => {
        // Ignore late closes from a torn-down effect run. `cancelled` is
        // captured per-run so a previous run's socket can't act here.
        if (cancelled) return
        // Guard against a stale onclose deleting the new run's live socket:
        // only clear/reschedule if this ws is still the registered one.
        if (socketsRef.current[spec.label] !== ws) return
        delete socketsRef.current[spec.label]
        stateRef.current[spec.label] = 'disconnected'
        computeAggregate()
        const current = attemptsRef.current[spec.label] ?? 0
        const idx = Math.min(current, BACKOFF_STEPS_MS.length - 1)
        const delay = BACKOFF_STEPS_MS[idx]
        attemptsRef.current[spec.label] = current + 1
        timersRef.current[spec.label] = window.setTimeout(
          () => connect(spec),
          delay,
        )
      }
    }

    specs.forEach(connect)

    return () => {
      cancelled = true
      Object.values(timersRef.current).forEach((t) => window.clearTimeout(t))
      timersRef.current = {}
      Object.values(socketsRef.current).forEach((ws) => ws.close())
      socketsRef.current = {}
    }
  }, [courtID, enabled, matchPublicID, qc])

  return { state, attempt, lastMessageAt }
}

/**
 * Routes a parsed message to the right cache entry based on type.
 * Unknown message types are ignored; this keeps the hook forward-
 * compatible with new event types the backend may add later.
 */
function applyMessage(
  qc: QueryClient,
  courtID: number,
  msg: OverlayWSMessage,
): void {
  switch (msg.type) {
    case 'overlay_data': {
      // useOverlayData keys by (courtID, token ?? null, !!demo), so a
      // hardcoded null/false key misses token-gated and demo overlays.
      // Write by prefix predicate so the merge lands on whatever variant
      // the renderer is actually observing — no HTTP round-trip. The raw
      // backend shape is stored; normalizeOverlayData still runs via the
      // query's `select` on read, preserving current behavior. Only touch
      // entries something is observing (prev !== undefined).
      qc.setQueriesData<OverlayData>(
        { queryKey: ['overlay', 'data', courtID] },
        (prev) => (prev === undefined ? prev : (msg.data as OverlayData)),
      )
      break
    }
    case 'config_update': {
      qc.setQueryData<CourtOverlayConfig>(
        ['overlay', 'config', courtID],
        msg.data as CourtOverlayConfig,
      )
      // The config change may alter source profile → refetch live data.
      qc.invalidateQueries({ queryKey: ['overlay', 'data', courtID] })
      break
    }
    case 'match_update': {
      const match = msg.data as Match
      if (match?.public_id) {
        qc.setQueryData(['matches', match.public_id], match)
        qc.invalidateQueries({
          queryKey: ['match-events', match.public_id],
        })
      }
      // An active-match score change also invalidates the overlay
      // data query: the backend recomputes OverlayData from the match
      // and republishes on the overlay channel, but we preemptively
      // refresh in case the channel drops a message.
      qc.invalidateQueries({ queryKey: ['overlay', 'data', courtID] })
      break
    }
    default:
      // match_complete, match_started, etc. — no targeted merge.
      // The overlay channel will also republish overlay_data.
      break
  }
}
