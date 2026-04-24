import {  useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type {ReactNode} from 'react';

interface AccordionProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: ReactNode
  rightAdornment?: ReactNode
}

/** Pure CSS accordion — grid-template-rows 0fr↔1fr transition, no motion library. */
export function Accordion({
  title,
  subtitle,
  defaultOpen = false,
  children,
  rightAdornment,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-slate-750 transition-colors"
      >
        <div>
          <div className="font-bold text-white">{title}</div>
          {subtitle && (
            <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {rightAdornment}
          <ChevronDown
            className="cc-accordion-chevron w-5 h-5 text-slate-400"
            data-open={open}
          />
        </div>
      </button>
      <div className="cc-accordion-content" data-open={open}>
        <div>
          <div className="px-4 pb-4 pt-1 border-t border-slate-700">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
