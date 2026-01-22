import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Settings, Users, ArrowRightLeft, User, RefreshCw } from 'lucide-react'
import config from '../config'
import type { Team, Match, Player } from '../types/domain'
import { Spinner } from './Spinner'

interface MatchConfigurationPanelProps {
  match: Match
}

export function MatchConfigurationPanel({
  match,
}: MatchConfigurationPanelProps) {
  const queryClient = useQueryClient()

  // Form State
  const [team1Id, setTeam1Id] = useState<string>(
    match.team_1_id?.toString() || '',
  )
  const [team2Id, setTeam2Id] = useState<string>(
    match.team_2_id?.toString() || '',
  )
  const [team1Player1Id, setTeam1Player1Id] = useState<string>('')
  const [team1Player2Id, setTeam1Player2Id] = useState<string>('')
  const [team2Player1Id, setTeam2Player1Id] = useState<string>('')
  const [team2Player2Id, setTeam2Player2Id] = useState<string>('')
  const [firstServer, setFirstServer] = useState<number>(
    match.first_serving_team || 1,
  )

  // Sync state if match data updates from server
  useEffect(() => {
    if (match.team_1_id) setTeam1Id(match.team_1_id.toString())
    if (match.team_2_id) setTeam2Id(match.team_2_id.toString())
    if (match.first_serving_team) setFirstServer(match.first_serving_team)

    // Hydrate players from participants if they exist
    if (match.participants?.team_1?.player_1?.id)
      setTeam1Player1Id(match.participants.team_1.player_1.id.toString())
    if (match.participants?.team_1?.player_2?.id)
      setTeam1Player2Id(match.participants.team_1.player_2.id.toString())
    if (match.participants?.team_2?.player_1?.id)
      setTeam2Player1Id(match.participants.team_2.player_1.id.toString())
    if (match.participants?.team_2?.player_2?.id)
      setTeam2Player2Id(match.participants.team_2.player_2.id.toString())
  }, [match])

  // Fetch Data
  const { data: teams, isLoading: teamsLoading } = useQuery<Array<Team>>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/teams`)
      if (!res.ok) throw new Error('Failed to fetch teams')
      return res.json()
    },
  })

  const { data: players, isLoading: playersLoading } = useQuery<Array<Player>>({
    queryKey: ['players'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/players`)
      if (!res.ok) throw new Error('Failed to fetch players')
      return res.json()
    },
  })

  // Configure Match Mutation
  const configureMutation = useMutation({
    mutationFn: async () => {
      const t1 = teams?.find((t) => t.id?.toString() === team1Id)
      const t2 = teams?.find((t) => t.id?.toString() === team2Id)

      const p1_1 = players?.find((p) => p.id?.toString() === team1Player1Id)
      const p1_2 = players?.find((p) => p.id?.toString() === team1Player2Id)
      const p2_1 = players?.find((p) => p.id?.toString() === team2Player1Id)
      const p2_2 = players?.find((p) => p.id?.toString() === team2Player2Id)

      const payload = {
        team_1_id: team1Id ? parseInt(team1Id) : null,
        team_2_id: team2Id ? parseInt(team2Id) : null,
        first_serving_team: firstServer,
        participants: {
          team_1: {
            ...t1,
            name: t1?.name || 'Team 1',
            player_1: p1_1,
            player_2: p1_2,
          },
          team_2: {
            ...t2,
            name: t2?.name || 'Team 2',
            player_1: p2_1,
            player_2: p2_2,
          },
        },
      }

      const res = await fetch(
        `${config.API_URL}/matches/${match.public_id}/configure`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) throw new Error('Failed to update configuration')
      return res.json()
    },
    onSuccess: (updatedMatch) => {
      queryClient.setQueryData(['match', match.public_id], updatedMatch)
    },
  })

  if (teamsLoading || playersLoading) return <Spinner />

  const getTeamPlayers = (teamId: string) => {
    const team = teams?.find((t) => t.id?.toString() === teamId)
    if (!team) return []
    return players?.filter((p) => team.player_ids.includes(p.id!)) || []
  }

  const swapPlayers = (team: 1 | 2) => {
    if (team === 1) {
      const temp = team1Player1Id
      setTeam1Player1Id(team1Player2Id)
      setTeam1Player2Id(temp)
    } else {
      const temp = team2Player1Id
      setTeam2Player1Id(team2Player2Id)
      setTeam2Player2Id(temp)
    }
  }

  return (
    <div className="bg-slate-800 p-6 border border-slate-700 rounded-xl">
      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-700 font-semibold text-lime-400 text-lg">
        <Settings className="w-5 h-5" /> Match Configuration
      </div>

      <div className="gap-8 grid grid-cols-1 md:grid-cols-2">
        {/* Team 1 Configuration */}
        <div className="space-y-4 bg-slate-900/30 p-4 border border-slate-700 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 font-semibold text-slate-300 text-sm uppercase tracking-wider">
              <Users className="w-4 h-4" /> Team 1 (Home)
            </div>
            <button
              onClick={() => swapPlayers(1)}
              className="flex items-center gap-1 text-slate-500 hover:text-white text-xs transition-colors"
              title="Swap Player 1 & 2"
            >
              <RefreshCw className="w-3 h-3" /> Swap
            </button>
          </div>

          <select
            value={team1Id}
            onChange={(e) => setTeam1Id(e.target.value)}
            className="bg-slate-900 border-slate-600 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
          >
            <option value="">-- Select Team --</option>
            {teams?.map((t) => (
              <option
                key={t.id}
                value={t.id || ''}
                disabled={t.id?.toString() === team2Id}
              >
                {t.name}
              </option>
            ))}
          </select>

          {team1Id && (
            <div className="gap-2 grid grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-500 text-[10px] uppercase">
                  Player 1 (Starts Right)
                </label>
                <select
                  value={team1Player1Id}
                  onChange={(e) => setTeam1Player1Id(e.target.value)}
                  className="bg-slate-800 border-slate-700 p-2 border rounded text-white text-sm w-full outline-none"
                >
                  <option value="">-- Player --</option>
                  {getTeamPlayers(team1Id).map((p) => (
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
                  value={team1Player2Id}
                  onChange={(e) => setTeam1Player2Id(e.target.value)}
                  className="bg-slate-800 border-slate-700 p-2 border rounded text-white text-sm w-full outline-none"
                >
                  <option value="">-- Player --</option>
                  {getTeamPlayers(team1Id).map((p) => (
                    <option key={p.id} value={p.id || ''}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Team 2 Configuration */}
        <div className="space-y-4 bg-slate-900/30 p-4 border border-slate-700 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 font-semibold text-slate-300 text-sm uppercase tracking-wider">
              <Users className="w-4 h-4" /> Team 2 (Away)
            </div>
            <button
              onClick={() => swapPlayers(2)}
              className="flex items-center gap-1 text-slate-500 hover:text-white text-xs transition-colors"
              title="Swap Player 1 & 2"
            >
              <RefreshCw className="w-3 h-3" /> Swap
            </button>
          </div>

          <select
            value={team2Id}
            onChange={(e) => setTeam2Id(e.target.value)}
            className="bg-slate-900 border-slate-600 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
          >
            <option value="">-- Select Team --</option>
            {teams?.map((t) => (
              <option
                key={t.id}
                value={t.id || ''}
                disabled={t.id?.toString() === team1Id}
              >
                {t.name}
              </option>
            ))}
          </select>

          {team2Id && (
            <div className="gap-2 grid grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-500 text-[10px] uppercase">
                  Player 1 (Starts Right)
                </label>
                <select
                  value={team2Player1Id}
                  onChange={(e) => setTeam2Player1Id(e.target.value)}
                  className="bg-slate-800 border-slate-700 p-2 border rounded text-white text-sm w-full outline-none"
                >
                  <option value="">-- Player --</option>
                  {getTeamPlayers(team2Id).map((p) => (
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
                  value={team2Player2Id}
                  onChange={(e) => setTeam2Player2Id(e.target.value)}
                  className="bg-slate-800 border-slate-700 p-2 border rounded text-white text-sm w-full outline-none"
                >
                  <option value="">-- Player --</option>
                  {getTeamPlayers(team2Id).map((p) => (
                    <option key={p.id} value={p.id || ''}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4 font-semibold text-slate-300 text-sm uppercase tracking-wider">
          <ArrowRightLeft className="w-4 h-4" /> Service Logic
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setFirstServer(1)}
            className={`flex-1 p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 ${
              firstServer === 1
                ? 'border-lime-500 bg-lime-500/10 text-lime-400 font-bold'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
            }`}
          >
            Team 1 Serves First
          </button>
          <button
            onClick={() => setFirstServer(2)}
            className={`flex-1 p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-3 ${
              firstServer === 2
                ? 'border-lime-500 bg-lime-500/10 text-lime-400 font-bold'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
            }`}
          >
            Team 2 Serves First
          </button>
        </div>
      </div>

      <div className="flex justify-end mt-6 pt-4 border-t border-slate-700">
        <button
          onClick={() => configureMutation.mutate()}
          disabled={configureMutation.isPending}
          className="bg-lime-600 hover:bg-lime-500 disabled:opacity-50 px-8 py-3 rounded-lg font-bold text-white transition-all shadow-lg"
        >
          {configureMutation.isPending
            ? 'Updating...'
            : 'Update Match Configuration'}
        </button>
      </div>
    </div>
  )
}