import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import config from '../config'
import Ticker from '../components/Ticker'
import { useWebSocket } from '../hooks/useWebSocket'
import {
  hsl,
  resolveImageUrl,
  resolveTheme,
} from '../utils/theme'
import type { Court, Team } from '../types/domain'

export const Route = createFileRoute('/courts/$courtSlug/ticker')({
  component: CourtTicker,
})

function CourtTicker() {
  const { courtSlug } = Route.useParams()

  // 1. Get Court -> Active Match ID
  const { data: court, isLoading: isCourtLoading } = useQuery<Court>({
    queryKey: ['court', courtSlug],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/courts/${courtSlug}`)
      if (!res.ok) throw new Error('Court not found')
      return res.json()
    },
    refetchInterval: 10000,
  })

  const matchId = court?.active_match?.public_id

  useWebSocket({
    url: matchId ? `${config.WS_URL}/ws/matches/${matchId}` : '',
    queryKey: ['match', matchId],
  })

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

  const { data: match, isLoading: isMatchLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}`)
      if (!res.ok) throw new Error('Match not found')
      return res.json()
    },
    enabled: !!matchId,
  })

  // Fetch teams for logo_url fallbacks (small, cached).
  const { data: teams } = useQuery<Array<Team>>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/teams`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const theme = useMemo(() => resolveTheme(court?.theme), [court?.theme])

  // Explicit transparent root for cross-webview safety (Safari/WKWebView/CEF).
  // Also handles the `backgroundMode` setting for the whole page.
  useEffect(() => {
    const prevHtmlBg = document.documentElement.style.backgroundColor
    const prevBodyBg = document.body.style.backgroundColor
    const prevBodyBgImage = document.body.style.backgroundImage
    const prevBodyBgSize = document.body.style.backgroundSize
    const prevBodyBgPosition = document.body.style.backgroundPosition

    const setTransparent = () => {
      document.documentElement.style.backgroundColor = 'transparent'
      document.body.style.backgroundColor = 'transparent'
      document.body.style.backgroundImage = ''
    }

    if (theme.backgroundMode === 'transparent') {
      setTransparent()
    } else if (theme.backgroundMode === 'color') {
      document.documentElement.style.backgroundColor = hsl(
        theme.colors.pageBackground,
      )
      document.body.style.backgroundColor = hsl(theme.colors.pageBackground)
      document.body.style.backgroundImage = ''
    } else {
      // image mode
      const url = theme.backgroundImage
        ? resolveImageUrl(theme.backgroundImage, config.API_URL)
        : null
      document.documentElement.style.backgroundColor = hsl(
        theme.colors.pageBackground,
      )
      document.body.style.backgroundColor = hsl(theme.colors.pageBackground)
      if (url) {
        document.body.style.backgroundImage = `url("${url}")`
        document.body.style.backgroundSize = 'cover'
        document.body.style.backgroundPosition = 'center'
      } else {
        document.body.style.backgroundImage = ''
      }
    }

    return () => {
      document.documentElement.style.backgroundColor = prevHtmlBg
      document.body.style.backgroundColor = prevBodyBg
      document.body.style.backgroundImage = prevBodyBgImage
      document.body.style.backgroundSize = prevBodyBgSize
      document.body.style.backgroundPosition = prevBodyBgPosition
    }
  }, [
    theme.backgroundMode,
    theme.backgroundImage,
    theme.colors.pageBackground,
  ])

  if (isCourtLoading || (matchId && isMatchLoading)) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-900 text-white">
        Loading...
      </div>
    )
  }

  if (!court?.active_match) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-900 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Court Ready</h1>
          <p className="text-slate-400">Waiting for match to start...</p>
        </div>
      </div>
    )
  }

  if (!match) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-900 text-white">
        Error loading match data.
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-transparent flex items-center justify-center px-4 overflow-hidden overscroll-none touch-none select-none">
      <Ticker
        match={match}
        isVisible={court.is_ticker_visible}
        theme={court.theme}
        teams={teams}
      />
    </div>
  )
}
