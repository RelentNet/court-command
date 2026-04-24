import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import config from '../config'
import type { Court, CourtTheme } from '../types/domain'

interface UseThemePatchOptions {
  courtSlug: string
  /** Debounce window for network PATCHes. Live updates feel instant below this. */
  debounceMs?: number
}

/**
 * Optimistically writes the theme to the React Query cache (so the live preview
 * updates synchronously) and debounces the actual HTTP PATCH to `/courts/{slug}/theme`.
 * The backend broadcasts the change via the `court_updates_{slug}` Redis channel,
 * so every open `/ticker` and console gets it instantly over the existing WS.
 */
export function useThemePatch({
  courtSlug,
  debounceMs = 400,
}: UseThemePatchOptions) {
  const queryClient = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<CourtTheme | null>(null)
  const inFlightRef = useRef<boolean>(false)

  const flush = useCallback(async () => {
    const initial = pendingRef.current
    if (!initial || inFlightRef.current) return
    pendingRef.current = null
    inFlightRef.current = true
    try {
      await fetch(`${config.API_URL}/courts/${courtSlug}/theme`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: initial }),
      })
    } catch (err) {
      // Surface in console, but don't throw — live preview already reflects the change.
      console.error('Theme PATCH failed:', err)
    } finally {
      inFlightRef.current = false
      // If another change queued up during the request, re-run flush.
      // (ref may have been reassigned by patch() while we awaited.)
      const queued = pendingRef.current as CourtTheme | null
      if (queued) {
        queueMicrotask(() => {
          flush()
        })
      }
    }
  }, [courtSlug])

  const patch = useCallback(
    (theme: CourtTheme) => {
      // 1. Optimistic cache update — preview sees the new theme immediately.
      queryClient.setQueryData<Court | undefined>(
        ['court', courtSlug],
        (prev) => (prev ? { ...prev, theme } : prev),
      )

      // 2. Queue for debounced PATCH.
      pendingRef.current = theme
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        flush()
      }, debounceMs)
    },
    [courtSlug, queryClient, flush, debounceMs],
  )

  // Flush on unmount so we don't lose the last change.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        flush()
      }
    }
  }, [flush])

  return { patch }
}
