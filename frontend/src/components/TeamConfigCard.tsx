import { RefreshCw, Users, Plus } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { Team, Player } from '../types/domain'

interface TeamConfigCardProps {
  label: string
  teamId: string
  otherTeamId: string
  player1Id: string
  player2Id: string
  teams: Team[]
  players: Player[]
  onTeamChange: (id: string) => void
  onPlayer1Change: (id: string) => void
  onPlayer2Change: (id: string) => void
  onSwap: () => void
  onCreateTeam: () => void
}

export function TeamConfigCard({
  label,
  teamId,
  otherTeamId,
  player1Id,
  player2Id,
  teams,
  players,
  onTeamChange,
  onPlayer1Change,
  onPlayer2Change,
  onSwap,
  onCreateTeam,
}: TeamConfigCardProps) {
  
  const getTeamPlayers = (tid: string) => {
    const team = teams?.find((t) => t.id?.toString() === tid)
    if (!team) return []
    return players?.filter((p) => team.player_ids.includes(p.id!)) || []
  }

  return (
    <div className="space-y-4 bg-slate-900/30 p-4 border border-slate-700 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 font-semibold text-slate-300 text-sm uppercase tracking-wider">
          <Users className="w-4 h-4" /> {label}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCreateTeam}
            className="flex items-center gap-1 text-lime-500 hover:text-lime-400 text-xs transition-colors"
          >
            <Plus className="w-3 h-3" /> New
          </button>
          <button
            onClick={onSwap}
            className="flex items-center gap-1 text-slate-500 hover:text-white text-xs transition-colors"
            title="Swap Player 1 & 2"
          >
            <RefreshCw className="w-3 h-3" /> Swap
          </button>
        </div>
      </div>

      {teams && teams.length < 2 && (
        <div className="bg-amber-500/10 p-3 border border-amber-500/20 rounded text-amber-500 text-xs">
          Not enough teams available.{' '}
          <Link to="/registry" className="font-bold hover:underline">
            Create teams in Registry
          </Link>
        </div>
      )}

      <select
        value={teamId}
        onChange={(e) => onTeamChange(e.target.value)}
        className="bg-slate-900 border-slate-600 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
      >
        <option value="">-- Select Team --</option>
        {teams?.map((t) => (
          <option
            key={t.id}
            value={t.id || ''}
            disabled={t.id?.toString() === otherTeamId}
          >
            {t.name}
          </option>
        ))}
      </select>

      {teamId && (
        <div className="gap-2 grid grid-cols-1">
          <div>
            <label className="mb-1 block text-slate-500 text-[10px] uppercase">
              Player 1 (First Server)
            </label>
            <select
              value={player1Id}
              onChange={(e) => onPlayer1Change(e.target.value)}
              className="bg-slate-800 border-slate-700 p-3 border rounded text-white text-sm w-full outline-none"
            >
              <option value="">-- Select Player --</option>
              {getTeamPlayers(teamId).map((p) => (
                <option key={p.id} value={p.id || ''}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-slate-500 text-[10px] uppercase">
              Player 2
            </label>
            <select
              value={player2Id}
              onChange={(e) => onPlayer2Change(e.target.value)}
              className="bg-slate-800 border-slate-700 p-3 border rounded text-white text-sm w-full outline-none"
            >
              <option value="">-- Select Player --</option>
              {getTeamPlayers(teamId).map((p) => (
                <option key={p.id} value={p.id || ''}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
