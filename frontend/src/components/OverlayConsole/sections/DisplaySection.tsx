import type { CourtTheme } from '../../../types/domain'

interface DisplaySectionProps {
  theme: CourtTheme
  onChange: (theme: CourtTheme) => void
}

export function DisplaySection({ theme, onChange }: DisplaySectionProps) {
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 p-3 rounded-lg border bg-slate-900 border-slate-700 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-lime-500"
          checked={theme.showBorder}
          onChange={(e) =>
            onChange({ ...theme, showBorder: e.target.checked })
          }
        />
        <div>
          <div className="text-sm font-bold text-white">Show border</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Thin ring around the entire ticker.
          </div>
        </div>
      </label>

      <label className="flex items-start gap-3 p-3 rounded-lg border bg-slate-900 border-slate-700 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 accent-lime-500"
          checked={theme.useFullAssociationName}
          onChange={(e) =>
            onChange({
              ...theme,
              useFullAssociationName: e.target.checked,
            })
          }
        />
        <div>
          <div className="text-sm font-bold text-white">
            Use full association name
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Expands short codes (e.g. &quot;GPA&quot;) to the full name when
            no league override is set.
          </div>
        </div>
      </label>
    </div>
  )
}
