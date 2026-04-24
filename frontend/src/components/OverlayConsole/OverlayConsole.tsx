import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Layers,
  Paintbrush,
  Palette,
  RotateCcw,
  Sliders,
  Type,
} from 'lucide-react'
import config from '../../config'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useThemePatch } from '../../hooks/useThemePatch'
import { DEFAULT_THEME, resolveTheme } from '../../utils/theme'
import { Accordion } from './Accordion'
import { LivePreview } from './LivePreview'
import { PresetsSection } from './sections/PresetsSection'
import { DesignSection } from './sections/DesignSection'
import { BackgroundSection } from './sections/BackgroundSection'
import { LogosSection } from './sections/LogosSection'
import { OverridesSection } from './sections/OverridesSection'
import { DisplaySection } from './sections/DisplaySection'
import type { Court, CourtTheme, Match, Team } from '../../types/domain'

interface OverlayConsoleProps {
  courtSlug: string
}

export function OverlayConsole({ courtSlug }: OverlayConsoleProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const { data: court, isLoading: isCourtLoading } = useQuery<Court>({
    queryKey: ['court', courtSlug],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/courts/${courtSlug}`)
      if (!res.ok) throw new Error('Court not found')
      return res.json()
    },
  })

  // Sync cross-client theme changes (another operator editing the same court).
  useWebSocket({
    url: courtSlug ? `${config.WS_URL}/ws/courts/${courtSlug}` : '',
    queryKey: ['court', courtSlug],
    onMessage: (update, queryClient, key) => {
      queryClient.setQueryData(key, (oldData: Court | undefined) => {
        if (!oldData) return update as Court
        return { ...oldData, ...(update as Partial<Court>) }
      })
    },
  })

  const matchId = court?.active_match?.public_id

  const { data: match } = useQuery<Match>({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}`)
      if (!res.ok) throw new Error('Match not found')
      return res.json()
    },
    enabled: !!matchId,
  })

  useWebSocket({
    url: matchId ? `${config.WS_URL}/ws/matches/${matchId}` : '',
    queryKey: ['match', matchId],
  })

  const { data: teams = [] } = useQuery<Array<Team>>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/teams`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const theme = useMemo(() => resolveTheme(court?.theme), [court?.theme])

  const { patch } = useThemePatch({ courtSlug })

  const handleChange = useCallback(
    (next: CourtTheme) => {
      patch(next)
    },
    [patch],
  )

  const resetAll = () => {
    const ok = window.confirm(
      'Reset ALL theme settings to defaults? This cannot be undone.',
    )
    if (!ok) return
    patch(DEFAULT_THEME)
  }

  const copyTickerUrl = async () => {
    const url = `${window.location.origin}/courts/${courtSlug}/ticker`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch {
      // ignore
    }
  }

  if (isCourtLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-900 text-white">
        Loading…
      </div>
    )
  }

  if (!court) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-900 text-white">
        Court not found.
      </div>
    )
  }

  return (
    <div className="bg-slate-900 min-h-screen text-white">
      <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-6">
        {/* Breadcrumb / title */}
        <div className="flex items-start md:items-center gap-4 flex-col md:flex-row md:justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/tickers"
              className="hover:bg-slate-800 p-2 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="flex items-center gap-2 font-bold text-2xl">
                <Paintbrush className="w-6 h-6 text-lime-500" /> Overlay Console
              </h1>
              <p className="text-slate-400 text-sm">
                {court.name} · changes save automatically and apply live.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetAll}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg text-sm text-slate-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset all
            </button>
            <button
              type="button"
              onClick={copyTickerUrl}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg text-sm text-slate-300 transition-colors"
            >
              <Copy className="w-4 h-4" />
              {copiedUrl ? 'Copied!' : 'Copy Ticker URL'}
            </button>
            <Link
              to="/courts/$courtSlug/ticker"
              params={{ courtSlug }}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-lime-600 hover:bg-lime-500 px-4 py-2 rounded-lg font-bold text-sm text-slate-900 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Open Ticker
            </Link>
          </div>
        </div>

        {/* Split layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-6">
          {/* Left: controls */}
          <div className="space-y-3">
            <Accordion
              title="Presets"
              subtitle="Pick a starting point."
              defaultOpen
              rightAdornment={<Layers className="w-4 h-4 text-slate-500" />}
            >
              <PresetsSection theme={theme} onApply={handleChange} />
            </Accordion>

            <Accordion
              title="Design"
              subtitle="Colors & contrast."
              rightAdornment={<Palette className="w-4 h-4 text-slate-500" />}
            >
              <DesignSection theme={theme} onChange={handleChange} />
            </Accordion>

            <Accordion
              title="Background"
              subtitle="Transparent, solid, or image."
              rightAdornment={<Sliders className="w-4 h-4 text-slate-500" />}
            >
              <BackgroundSection theme={theme} onChange={handleChange} />
            </Accordion>

            <Accordion
              title="Logos"
              subtitle="Association & team logos, zoom."
            >
              <LogosSection
                theme={theme}
                onChange={handleChange}
                match={match ?? null}
                teams={teams}
              />
            </Accordion>

            <Accordion
              title="Text Overrides"
              subtitle="Override any text field."
              rightAdornment={<Type className="w-4 h-4 text-slate-500" />}
            >
              <OverridesSection
                theme={theme}
                onChange={handleChange}
                match={match ?? null}
              />
            </Accordion>

            <Accordion title="Display" subtitle="Border & association name.">
              <DisplaySection theme={theme} onChange={handleChange} />
            </Accordion>
          </div>

          {/* Right: sticky live preview */}
          <div className="lg:sticky lg:top-6 self-start space-y-4">
            <LivePreview
              theme={theme}
              match={match ?? null}
              teams={teams}
            />
            <div className="bg-slate-800/50 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-1.5">
              <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wide">
                Tips
              </div>
              <p>
                <strong>Transparent</strong> mode is what you pick in OBS /
                vMix with chroma or direct transparency.
              </p>
              <p>
                Placeholder text in override inputs shows the current live
                value — leave blank to fall back to it.
              </p>
              <p>
                Team logo uploads save to the team&apos;s registry record, so
                every match they play benefits.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
