import { RotateCcw } from 'lucide-react'
import { DEFAULT_THEME } from '../../../utils/theme'
import { ColorControl } from '../controls/ColorControl'
import type { CourtTheme, HSL, TextColorMode } from '../../../types/domain'

interface DesignSectionProps {
  theme: CourtTheme
  onChange: (theme: CourtTheme) => void
}

export function DesignSection({ theme, onChange }: DesignSectionProps) {
  const setColor = (key: keyof CourtTheme['colors'], hsl: HSL) => {
    if (key === 'text') return
    onChange({
      ...theme,
      colors: { ...theme.colors, [key]: hsl },
    })
  }

  const setTextMode = (mode: TextColorMode) => {
    onChange({
      ...theme,
      colors: {
        ...theme.colors,
        text: { ...theme.colors.text, mode },
      },
    })
  }

  const setTextValue = (hsl: HSL) => {
    onChange({
      ...theme,
      colors: {
        ...theme.colors,
        text: { mode: 'manual', value: hsl },
      },
    })
  }

  const resetColors = () => {
    onChange({
      ...theme,
      colors: DEFAULT_THEME.colors,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Drag any picker to tune. The live preview and any open ticker update
          instantly.
        </p>
        <button
          type="button"
          onClick={resetColors}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset colors
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ColorControl
          label="Header & Footer"
          description="Top and bottom bars."
          value={theme.colors.headerFooter}
          onChange={(v) => setColor('headerFooter', v)}
        />
        <ColorControl
          label="Body"
          description="The strip holding the two team rows."
          value={theme.colors.body}
          onChange={(v) => setColor('body', v)}
        />
        <ColorControl
          label="Badge / Association Cell"
          description="The left square holding the association logo."
          value={theme.colors.badge}
          onChange={(v) => setColor('badge', v)}
        />
        <ColorControl
          label="Score Column"
          description="The two score cells on the right."
          value={theme.colors.score}
          onChange={(v) => setColor('score', v)}
        />
      </div>

      {/* Text color */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase text-slate-300">
              Header / Footer Text Color
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Body &amp; score text auto-contrasts to black or white.
            </div>
          </div>
          <div className="flex bg-slate-800 rounded-md p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTextMode('auto')}
              className={`px-3 py-1 rounded ${
                theme.colors.text.mode === 'auto'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400'
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              onClick={() => setTextMode('manual')}
              className={`px-3 py-1 rounded ${
                theme.colors.text.mode === 'manual'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400'
              }`}
            >
              Manual
            </button>
          </div>
        </div>
        {theme.colors.text.mode === 'manual' && (
          <ColorControl
            label="Manual Text Color"
            value={theme.colors.text.value}
            onChange={setTextValue}
          />
        )}
      </div>
    </div>
  )
}
