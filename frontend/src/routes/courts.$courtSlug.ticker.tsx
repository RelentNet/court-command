import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import config from '../config'
import Ticker from '../components/Ticker'
import { useWebSocket } from '../hooks/useWebSocket'
import type { Court } from '../types/domain'

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
    // Refresh court data periodically in case a new match starts
    refetchInterval: 10000,
  })

  const matchId = court?.active_match?.public_id

  // 2. Subscribe to sockets
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

  // 3. Get Match Data
  const { data: match, isLoading: isMatchLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}`)
      if (!res.ok) throw new Error('Match not found')
      return res.json()
    },
    enabled: !!matchId,
  })

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
    <div className="min-h-screen bg-transparent relative flex items-center justify-center px-4 padding-safe">
      <Ticker match={match} isVisible={court.is_ticker_visible} />
    </div>
  )
}