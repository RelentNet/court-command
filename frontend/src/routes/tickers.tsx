import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Monitor, Paintbrush } from 'lucide-react'
import config from '../config'
import { TickerControl } from '../components/TickerControl'
import type { Court } from '../types/domain'

export const Route = createFileRoute('/tickers')({
  component: TickersPage,
})

// Extend Court to include is_active from the summary endpoint if needed, 
// but TickerControl only needs Court properties.
interface CourtSummary extends Court {
  is_active?: boolean
}

function TickersPage() {
  const { data: courts, isLoading } = useQuery<Array<CourtSummary>>({
    queryKey: ['courts'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/courts`)
      if (!res.ok) throw new Error('Failed to fetch courts')
      return res.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center bg-slate-900 min-h-screen text-white">
        Loading...
      </div>
    )
  }

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-6 mx-auto max-w-4xl">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="hover:bg-slate-800 p-2 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="flex items-center gap-3 font-bold text-3xl">
              <Monitor className="w-8 h-8 text-lime-500" /> Ticker Management
            </h1>
            <p className="text-slate-400">
              Control visibility of broadcast tickers for all courts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {courts?.map((court) => (
            <div key={court.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="flex justify-between items-center bg-slate-800/50 p-4 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${court.is_active ? 'bg-lime-500 animate-pulse' : 'bg-slate-600'}`} />
                  <h2 className="font-bold text-xl">{court.name}</h2>
                </div>
                <div className="flex gap-3">
                  <Link
                    to="/courts/$courtSlug/referee"
                    params={{ courtSlug: court.slug }}
                    className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg font-bold text-sm text-white transition-colors"
                  >
                    Referee Console
                  </Link>
                  <Link
                    to="/courts/$courtSlug/overlay-console"
                    params={{ courtSlug: court.slug }}
                    className="flex items-center gap-1.5 bg-lime-600 hover:bg-lime-500 px-4 py-2 rounded-lg font-bold text-sm text-slate-900 transition-colors"
                  >
                    <Paintbrush className="w-4 h-4" /> Overlay Console
                  </Link>
                  <Link
                    to="/courts/$courtSlug/ticker"
                    params={{ courtSlug: court.slug }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg font-bold text-sm text-white transition-colors"
                  >
                    Open Ticker ↗
                  </Link>
                </div>
              </div>
              
              <div className="p-4">
                <TickerControl
                  court={court}
                  className="bg-transparent border-none shadow-none p-0"
                />
              </div>
            </div>
          ))}
          
          {courts?.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              No courts found.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
