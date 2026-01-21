import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import config from '../config'
import { MatchContainer } from '../components/MatchContainer'

export const Route = createFileRoute('/courts/$courtSlug/scoreboard')({
  component: CourtScoreboard,
})

function CourtScoreboard() {
  const { courtSlug } = Route.useParams()

  const { data: court, isLoading } = useQuery({
    queryKey: ['court', courtSlug],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/courts/${courtSlug}`)
      if (!res.ok) throw new Error('Court not found')
      return res.json()
    },
  })

  if (isLoading) return <div className="p-8 text-white">Loading...</div>
  if (!court?.active_match) return <div className="p-8 text-white">No active match on this court.</div>

  // Render in read-only mode
  return <MatchContainer matchId={court.active_match.public_id} readonly />
}
