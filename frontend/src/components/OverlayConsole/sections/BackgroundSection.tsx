import { ColorControl } from '../controls/ColorControl'
import { ImageUpload } from '../controls/ImageUpload'
import type { BackgroundMode, CourtTheme, HSL } from '../../../types/domain'

interface BackgroundSectionProps {
  theme: CourtTheme
  onChange: (theme: CourtTheme) => void
}

const MODES: Array<{ id: BackgroundMode; label: string; hint: string }> = [
  {
    id: 'transparent',
    label: 'Transparent',
    hint: 'For OBS / vMix chroma keying — the ticker sits on whatever is underneath.',
  },
  {
    id: 'color',
    label: 'Solid Color',
    hint: 'A flat color behind the ticker. Use this for live non-chroma displays.',
  },
  {
    id: 'image',
    label: 'Image',
    hint: 'Upload a background image. Cover-fitted to the viewport.',
  },
]

export function BackgroundSection({
  theme,
  onChange,
}: BackgroundSectionProps) {
  const setMode = (mode: BackgroundMode) => {
    onChange({ ...theme, backgroundMode: mode })
  }

  const setPageColor = (hsl: HSL) => {
    onChange({
      ...theme,
      colors: { ...theme.colors, pageBackground: hsl },
    })
  }

  const setBackgroundImage = (url: string | null) => {
    onChange({
      ...theme,
      backgroundImage: url,
      // If switching an image in, snap to image mode for convenience.
      backgroundMode:
        url && theme.backgroundMode !== 'image' ? 'image' : theme.backgroundMode,
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        What appears <em>behind</em> the ticker on the Open Ticker page.
      </p>

      <div className="grid grid-cols-1 gap-2">
        {MODES.map((m) => (
          <label
            key={m.id}
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              theme.backgroundMode === m.id
                ? 'bg-lime-500/10 border-lime-500/50'
                : 'bg-slate-900 border-slate-700 hover:border-slate-600'
            }`}
          >
            <input
              type="radio"
              name="bg-mode"
              className="mt-1 accent-lime-500"
              checked={theme.backgroundMode === m.id}
              onChange={() => setMode(m.id)}
            />
            <div>
              <div className="text-sm font-bold text-white">{m.label}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{m.hint}</div>
            </div>
          </label>
        ))}
      </div>

      {theme.backgroundMode === 'color' && (
        <ColorControl
          label="Page Background"
          description="Solid color rendered behind the ticker."
          value={theme.colors.pageBackground}
          onChange={setPageColor}
        />
      )}

      {theme.backgroundMode === 'image' && (
        <div className="space-y-3">
          <ImageUpload
            label="Background Image"
            description="Displayed full-bleed behind the ticker (cover-fit)."
            value={theme.backgroundImage}
            onChange={setBackgroundImage}
          />
          <ColorControl
            label="Fallback Color"
            description="Shown before the image loads / on transparent image edges."
            value={theme.colors.pageBackground}
            onChange={setPageColor}
          />
        </div>
      )}
    </div>
  )
}
