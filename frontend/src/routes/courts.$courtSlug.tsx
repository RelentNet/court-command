import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import config from '../config'

export const Route = createFileRoute('/courts/$courtSlug')({
  component: CourtDetail,
})

function CourtDetail() {
  const { courtSlug } = Route.useParams()

  const { data: court, isLoading, error } = useQuery({
    queryKey: ['court', courtSlug],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/api/courts/${courtSlug}`)
      if (!res.ok) throw new Error('Court not found')
      return res.json()
    },
  })

  if (isLoading) return <div className="p-8 text-white">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Court not found</div>

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-6 mx-auto max-w-4xl">
        <div className="flex items-center gap-4">
          <a
            href="/courts"
            className="hover:bg-slate-800 p-2 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </a>
          <div>
            <h1 className="font-bold text-3xl">{court.name}</h1>
            <p className="text-slate-400">Manage matches for this court here.</p>
          </div>
        </div>

        {/* Placeholder for Active Match */}
        <div className="bg-slate-800 p-12 border border-slate-700 rounded-xl text-center">
          <div className="mb-4 font-mono text-4xl">🎾</div>
          <h2 className="mb-2 font-semibold text-xl">No Active Match</h2>
          <p className="text-slate-400">
            Start a new match to display the scoreboard.
          </p>
          <button className="bg-lime-600 hover:bg-lime-500 mt-6 px-6 py-2 rounded font-bold transition-colors">
            Start Match
          </button>
        </div>
      </div>
    </div>
  )
}
