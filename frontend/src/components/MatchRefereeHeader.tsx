import { ArrowLeft } from 'lucide-react'
import type { Match } from '../types/domain'

interface MatchRefereeHeaderProps {
  match: Match
  wsStatus: string
  actions: React.ReactNode
}

export function MatchRefereeHeader({
  match,
  wsStatus,
  actions,
}: MatchRefereeHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-6">
      <div className="flex items-center gap-4">
        <a
          href={match.court_slug ? `/courts/${match.court_slug}` : '/'}
          className="hover:bg-slate-800 p-2 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </a>
        <div>
          <h1 className="font-bold text-2xl">
            {match.court_slug || 'Quick Match'}
          </h1>
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${wsStatus === 'OPEN' ? 'bg-green-500' : 'bg-red-500'}`}
            />
            WS: {wsStatus}
          </div>
        </div>
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  )
}
