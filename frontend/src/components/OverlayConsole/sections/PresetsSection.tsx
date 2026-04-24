import { Check } from 'lucide-react'
import { PRESETS, hsl } from '../../../utils/theme'
import type { CourtTheme } from '../../../types/domain'

interface PresetsSectionProps {
  theme: CourtTheme
  onApply: (theme: CourtTheme) => void
}

function themesEqual(a: CourtTheme, b: CourtTheme): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function PresetsSection({ theme, onApply }: PresetsSectionProps) {
  const handleClick = (next: CourtTheme) => {
    if (!themesEqual(theme, next)) {
      const ok = window.confirm(
        'Apply this preset? Your current customizations will be replaced.',
      )
      if (!ok) return
    }
    onApply(next)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400 mb-3">
        Pick a starting point. You can tweak any preset afterwards — changes
        save as you go.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {PRESETS.map((p) => {
          const active = themesEqual(theme, p.theme)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleClick(p.theme)}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                active
                  ? 'bg-lime-500/10 border-lime-500/50'
                  : 'bg-slate-900 border-slate-700 hover:border-slate-600'
              }`}
            >
              {/* Swatches */}
              <div className="flex gap-1 flex-shrink-0">
                <span
                  className="w-4 h-8 rounded"
                  style={{ backgroundColor: hsl(p.theme.colors.headerFooter) }}
                />
                <span
                  className="w-4 h-8 rounded"
                  style={{ backgroundColor: hsl(p.theme.colors.body) }}
                />
                <span
                  className="w-4 h-8 rounded"
                  style={{ backgroundColor: hsl(p.theme.colors.score) }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white truncate">
                    {p.label}
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-lime-500" />}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {p.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
