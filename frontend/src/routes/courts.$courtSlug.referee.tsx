import { Link, Navigate, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Paintbrush } from 'lucide-react'
import config from '../config'
import { MatchContainer } from '../components/MatchContainer'
import { TickerControl } from '../components/TickerControl'

export const Route = createFileRoute('/courts/$courtSlug/referee')({
  component: CourtReferee,
})

function CourtReferee() {
  const { courtSlug } = Route.useParams()

  const { data: court, isLoading } = useQuery({
    queryKey: ['court', courtSlug],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/courts/${courtSlug}`)
      if (!res.ok) throw new Error('Court not found')
      return res.json()
    },
  })

  if (isLoading)
    return (
      <div className="flex justify-center items-center bg-slate-900 min-h-screen text-white">
        Loading...
      </div>
    )
  
  // If no active match, or if the active match is FINAL, redirect to court detail
  if (!court?.active_match || court.active_match.status === 'final') {
    return <Navigate to="/courts/$courtSlug" params={{ courtSlug }} />
  }

  return (
    <div className="bg-slate-900 min-h-screen">
      <div className="mx-auto pt-4 px-4 max-w-5xl">
        <div className="flex justify-end mb-3">
          <Link
            to="/courts/$courtSlug/overlay-console"
            params={{ courtSlug }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg text-sm text-slate-300 transition-colors"
          >
            <Paintbrush className="w-4 h-4 text-lime-500" /> Overlay Console
          </Link>
        </div>
        <TickerControl court={court} className="mb-6" />
      </div>
      {/* MatchContainer handles its own layout, but we need to prevent double min-h-screen if possible or just let it stack */}
      <div className="-mt-4">
        <MatchContainer matchId={court.active_match.public_id} />
      </div>
    </div>
  )
}
