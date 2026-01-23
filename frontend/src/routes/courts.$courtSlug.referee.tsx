import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
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
  if (!court?.active_match)
    return (
      <div className="flex justify-center items-center bg-slate-900 min-h-screen text-white">
        No active match on this court.
      </div>
    )

  return (
    <div className="bg-slate-900 min-h-screen">
      <div className="mx-auto pt-4 px-4 max-w-5xl">
        <TickerControl court={court} className="mb-6" />
      </div>
      {/* MatchContainer handles its own layout, but we need to prevent double min-h-screen if possible or just let it stack */}
      <div className="-mt-4">
        <MatchContainer matchId={court.active_match.public_id} />
      </div>
    </div>
  )
}
