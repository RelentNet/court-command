// web/src/features/scoring/useMatchWebSocket.ts
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Match } from './types'

export type WebSocketState = 'connecting' | 'open' | 'disconnected'

interface MatchUpdateMessage {
  type: 'match_update'
  data: Match
}

const BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000, 16000, 30000]

function buildWsUrl(publicId: string): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Allow Vite proxy/host override via VITE_WS_URL; otherwise same host as page
  const base = (import.meta.env.VITE_WS_URL as string | undefined) || ''
  if (base) {
    return `${base.replace(/\/$/, '')}/ws/match/${publicId}`
  }
  return `${proto}//${window.location.host}/ws/match/${publicId}`
}

export function useMatchWebSocket(publicId: string | undefined): {
  state: WebSocketState
  lastUpdate: Match | undefined
  /** Number of reconnect attempts since the last successful open. */
  attempt: number
} {
  const qc = useQueryClient()
  const [state, setState] = useState<WebSocketState>('connecting')
  const [lastUpdate, setLastUpdate] = useState<Match | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const attemptsRef = useRef(0)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!publicId) return
    // Per-run cancellation. A single shared ref would be reset to false by
    // the next effect run before the previous run's socket fires its
    // (asynchronous) onclose, letting a torn-down run reschedule connect()
    // for the stale publicId and pollute the new run's state. Capturing the
    // flag in the effect closure ties it to this run only.
    let cancelled = false
    // Fresh per-run state so a late onclose from a previous run can't mutate
    // the new run's live socket/timer/attempt entries.
    attemptsRef.current = 0
    wsRef.current = null
    reconnectTimerRef.current = null

    const connect = () => {
      const url = buildWsUrl(publicId)
      if (!url) return
      setState('connecting')
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        attemptsRef.current = 0
        setAttempt(0)
        setState('open')
        // Re-fetch match on reconnect to pick up missed updates
        qc.invalidateQueries({ queryKey: ['matches', publicId] })
        qc.invalidateQueries({ queryKey: ['match-events', publicId] })
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as MatchUpdateMessage
          if (msg.type === 'match_update' && msg.data) {
            qc.setQueryData(['matches', publicId], msg.data)
            qc.invalidateQueries({ queryKey: ['match-events', publicId] })
            setLastUpdate(msg.data)
          }
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
        // Guard against a stale onclose clobbering the new run's live socket:
        // only clear/reschedule if this ws is still the registered one.
        if (wsRef.current !== ws) return
        wsRef.current = null
        setState('disconnected')
        const idx = Math.min(attemptsRef.current, BACKOFF_STEPS_MS.length - 1)
        const delay = BACKOFF_STEPS_MS[idx]
        attemptsRef.current += 1
        setAttempt(attemptsRef.current)
        reconnectTimerRef.current = window.setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [publicId, qc])

  return { state, lastUpdate, attempt }
}
