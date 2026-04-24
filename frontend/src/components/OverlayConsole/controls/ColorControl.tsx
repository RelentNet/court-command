import { useCallback, useEffect, useRef, useState } from 'react'
import { HslColorPicker } from 'react-colorful'
import { contrastTextColor, hsl } from '../../../utils/theme'
import type { HSL } from '../../../types/domain'

interface ColorControlProps {
  label: string
  description?: string
  value: HSL
  onChange: (next: HSL) => void
  disabled?: boolean
}

/**
 * A single HSL color picker + live readout + auto-contrast swatch.
 * Drag events are RAF-throttled so dragging the picker never pegs the CPU.
 */
export function ColorControl({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: ColorControlProps) {
  // Local mirror avoids feedback from parent re-render lag while dragging.
  const [local, setLocal] = useState<HSL>(value)
  const pendingRef = useRef<HSL | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    setLocal(value)
  }, [value.h, value.s, value.l])

  const flushRaf = useCallback(() => {
    rafRef.current = null
    if (pendingRef.current) {
      const next = pendingRef.current
      pendingRef.current = null
      onChange(next)
    }
  }, [onChange])

  const handleChange = useCallback(
    (next: HSL) => {
      setLocal(next)
      pendingRef.current = next
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushRaf)
      }
    },
    [flushRaf],
  )

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const autoText = contrastTextColor(local)

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <div className="mb-2">
        <div className="text-xs font-bold uppercase text-slate-300">
          {label}
        </div>
        {description && (
          <div className="text-xs text-slate-500 mt-0.5">{description}</div>
        )}
      </div>
      <div className="rounded-lg overflow-hidden bg-slate-900 p-3 border border-slate-700">
        <HslColorPicker
          color={local}
          onChange={handleChange}
          style={{ width: '100%', height: 140 }}
        />
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <code className="text-slate-400 font-mono">{hsl(local)}</code>
          <div
            className="flex items-center justify-center rounded-md px-3 py-1 text-xs font-bold"
            style={{ backgroundColor: hsl(local), color: autoText }}
            aria-label={`Auto-contrast preview: ${autoText}`}
          >
            {autoText.toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  )
}
