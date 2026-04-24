interface TextOverrideInputProps {
  label: string
  value: string
  liveValue: string
  onChange: (next: string) => void
  textarea?: boolean
}

/**
 * A text input whose *placeholder* shows the current live value.
 * Blank = fall back to live data (operator can see what they'd be replacing).
 */
export function TextOverrideInput({
  label,
  value,
  liveValue,
  onChange,
  textarea = false,
}: TextOverrideInputProps) {
  const placeholder = liveValue || '—'
  const commonProps = {
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(e.target.value),
    placeholder,
    className:
      'bg-slate-900 border-slate-700 p-2 border rounded-md w-full text-sm text-white placeholder:text-slate-500 focus:ring-2 focus:ring-lime-500 outline-none transition-all',
  }
  return (
    <label className="block">
      <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
        {label}
      </div>
      {textarea ? (
        <textarea rows={2} {...commonProps} />
      ) : (
        <input type="text" {...commonProps} />
      )}
    </label>
  )
}
