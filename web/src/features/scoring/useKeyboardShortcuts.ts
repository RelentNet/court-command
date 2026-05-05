// web/src/features/scoring/useKeyboardShortcuts.ts
import { useEffect } from 'react'

export interface KeyHandlers {
  onPointTeam1?: () => void // also primary "Point" in side-out mode
  onPointTeam2?: () => void
  onSideOut?: () => void
  onUndo?: () => void
  onTimeout?: () => void
  onEscape?: () => void
}

function isFromInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(
  handlers: KeyHandlers,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (isFromInput(e.target)) return
      switch (e.key) {
        case '1':
          handlers.onPointTeam1?.()
          break
        case '2':
          handlers.onPointTeam2?.()
          break
        // Smoke 11.6: Space is a single-handed "point for serving team"
        // shortcut. Side-out scoring means a successful rally for the
        // serving team is a point; for the receiving team it's a side
        // out (use S). Mapping Space -> onPointTeam1 keeps the one-key
        // workflow refs expect.
        case ' ':
          handlers.onPointTeam1?.()
          break
        case 's':
        case 'S':
          handlers.onSideOut?.()
          break
        case 'z':
        case 'Z':
          handlers.onUndo?.()
          break
        case 't':
        case 'T':
          handlers.onTimeout?.()
          break
        case 'Escape':
          handlers.onEscape?.()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers, enabled])
}
