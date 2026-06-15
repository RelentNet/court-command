// web/src/features/overlay/tv/TVKioskCourt.tsx
//
// Big-screen view for a single court. Renders the court's branded overlay
// with a framed kiosk chrome (court name banner, match context) above the
// overlay surface. Watermark pinned bottom-right.

import { useEffect } from 'react'
import { AlertTriangle, Tv } from 'lucide-react'
import { OverlayRenderer } from '../OverlayRenderer'
import { OverlayWatermark } from '../OverlayWatermark'
import { useOverlayDataBySlug } from '../hooks'

export interface TVKioskCourtProps {
  slug: string
}

export function TVKioskCourt({ slug }: TVKioskCourtProps) {
  const { courtsQuery, overlayQuery } = useOverlayDataBySlug(slug, {})
  const data = overlayQuery.data

  // Force dark theme + reset body for kiosk mode (smoke 14.1/14.2 --
  // venue TVs need dark backgrounds regardless of operator preference).
  useEffect(() => {
    const html = document.documentElement
    const wasDark = html.classList.contains('dark')
    html.classList.add('dark')
    const prevBg = document.body.style.background
    const prevOverflow = document.body.style.overflow
    document.body.style.background = '#000'
    document.body.style.overflow = 'hidden'
    return () => {
      if (!wasDark) html.classList.remove('dark')
      document.body.style.background = prevBg
      document.body.style.overflow = prevOverflow
    }
  }, [])

  if (courtsQuery.isLoading || overlayQuery.isLoading) {
    return (
      <FullScreenMessage icon={Tv} title="Loading court…" />
    )
  }

  if (courtsQuery.isError) {
    return (
      <FullScreenMessage
        icon={AlertTriangle}
        title="Court not found"
        subtitle={(courtsQuery.error as Error | undefined)?.message}
      />
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      <KioskHeader
        courtName={data?.court_name || 'Court'}
        tournamentName={data?.tournament_name || data?.league_name || ''}
        division={data?.division_name || ''}
        roundLabel={data?.round_label || ''}
      />
      <div className="flex-1 relative overflow-hidden">
        <OverlayRenderer slug={slug} fullscreen={false} />
      </div>
      <OverlayWatermark />
    </div>
  )
}

function KioskHeader({
  courtName,
  tournamentName,
  division,
  roundLabel,
}: {
  courtName: string
  tournamentName: string
  division: string
  roundLabel: string
}) {
  return (
    <header className="flex items-center justify-between px-10 py-5 border-b border-white/10 bg-black/60 backdrop-blur-sm">
      <div>
        <div className="text-xs uppercase tracking-widest text-white/60">
          {tournamentName || 'Live'}
        </div>
        <h1 className="text-3xl md:text-5xl font-bold mt-1">{courtName}</h1>
      </div>
      <div className="text-right">
        {division ? (
          <div className="text-sm md:text-base uppercase tracking-widest text-white/80">
            {division}
          </div>
        ) : null}
        {roundLabel ? (
          <div className="text-xs uppercase tracking-widest text-white/50 mt-1">
            {roundLabel}
          </div>
        ) : null}
      </div>
    </header>
  )
}

function FullScreenMessage({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Tv
  title: string
  subtitle?: string
}) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white">
      <Icon className="h-16 w-16 mb-6 text-white/70" />
      <div className="text-3xl font-semibold">{title}</div>
      {subtitle ? (
        <div className="mt-3 text-lg text-white/70">{subtitle}</div>
      ) : null}
    </div>
  )
}
