import { ArrowUpDown, Plus, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { Player, Team } from '../types/domain'

interface TeamConfigCardProps {
  label: string
  teamId: string
  otherTeamId: string
  player1Id: string
  player2Id: string
  teams: Array<Team>
  players: Array<Player>
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
    const team = teams.find((t) => t.id?.toString() === tid)
    if (!team) return []
    return players.filter((p) => team.player_ids.includes(p.id!)) || []
  }

  return (
    <div className="space-y-4 bg-slate-900/30 p-4 border border-slate-700 rounded-lg">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2 font-semibold text-slate-300 text-sm uppercase tracking-wider">
          <Users className="w-4 h-4" /> {label}
        </div>
      </div>

      {teams.length < 2 && (
        <div className="bg-amber-500/10 p-3 border border-amber-500/20 rounded text-amber-500 text-xs">
          Not enough teams available.{' '}
          <Link to="/registry" className="font-bold hover:underline">
            Create teams in Registry
          </Link>
        </div>
      )}

      {/* Team Selector Row */}
      <div className="flex gap-2">
        <select
          value={teamId}
          onChange={(e) => onTeamChange(e.target.value)}
          className="bg-slate-900 border-slate-600 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
        >
          <option value="">-- Select Team --</option>
          {teams.map((t) => (
            <option
              key={t.id}
              value={t.id || ''}
              disabled={t.id?.toString() === otherTeamId}
            >
              {t.name}
            </option>
          ))}
        </select>

        <button
          onClick={onCreateTeam}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 rounded-lg text-lime-500 transition-colors"
          title="Create New Team"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Player Assignment Section */}
      {teamId && (
        <div className="flex flex-col gap-2 bg-slate-900/50 p-3 border border-slate-800 rounded-lg">
          {/* Player 1 */}
          <div>
            <label className="mb-1 block text-slate-500 text-[10px] uppercase font-bold">
              Player 1 (First Server / BAND)
            </label>
            <select
              value={player1Id}
              onChange={(e) => onPlayer1Change(e.target.value)}
              className="bg-slate-800 border-slate-700 p-3 border rounded text-white text-sm w-full outline-none focus:border-lime-500 transition-colors"
            >
              <option value="">-- Select Player --</option>
              {getTeamPlayers(teamId).map((p) => (
                <option key={p.id} value={p.id || ''}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button (Centered) */}
          <div className="relative h-6">
            <div className="absolute inset-0 flex justify-center items-center">
              <div className="w-full h-px bg-slate-700/50"></div>
            </div>
            <div className="absolute inset-0 flex justify-center items-center">
              <button
                onClick={onSwap}
                className="bg-slate-700 hover:bg-lime-600 border border-slate-600 hover:border-lime-500 p-1 rounded-full text-slate-300 hover:text-white transition-all hover:scale-110 active:scale-95 shadow-sm"
                title="Swap Positions"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Player 2 */}
          <div>
            <label className="mb-1 block text-slate-500 text-[10px] uppercase font-bold">
              Player 2
            </label>
            <select
              value={player2Id}
              onChange={(e) => onPlayer2Change(e.target.value)}
              className="bg-slate-800 border-slate-700 p-3 border rounded text-white text-sm w-full outline-none focus:border-lime-500 transition-colors"
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
