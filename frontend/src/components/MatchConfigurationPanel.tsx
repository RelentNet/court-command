import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Settings,
  Trophy,
} from 'lucide-react'
import config from '../config'
import { Spinner } from './Spinner'
import { CreateTeamModal } from './CreateTeamModal'
import { TeamConfigCard } from './TeamConfigCard'
import type { Match, Player, Team } from '../types/domain'

interface MatchConfigurationPanelProps {
  match: Match
}

export function MatchConfigurationPanel({
  match,
}: MatchConfigurationPanelProps) {
  const queryClient = useQueryClient()
  const isStarted = match.status !== 'preparing'

  // Form State
  const [isOpen, setIsOpen] = useState(!isStarted)
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
  const [bestOf, setBestOf] = useState<number>(
    parseInt(match.config?.format?.split('_').pop() || '3'),
  )
  const [leagueName, setLeagueName] = useState<string>(
    match.config?.league_name || 'Global Padel Association',
  )
  const [tournamentName, setTournamentName] = useState<string>(
    match.config?.tournament_name || 'Nebula Padel Open 2026',
  )
  const [matchInfo, setMatchInfo] = useState<string>(
    match.config?.match_info || 'Quarter-Finals',
  )
  const [showTeamLogos, setShowTeamLogos] = useState<boolean>(
    match.config?.show_team_logos ?? true,
  )
  const [isTickerVisible, setIsTickerVisible] = useState<boolean>(
    match.config?.is_ticker_visible ?? true,
  )
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)

  // Sync state if match data updates from server
  useEffect(() => {
    if (match.team_1_id) setTeam1Id(match.team_1_id.toString())
    if (match.team_2_id) setTeam2Id(match.team_2_id.toString())
    if (match.first_serving_team) setFirstServer(match.first_serving_team)
    if (match.config.format) {
      setBestOf(parseInt(match.config.format.split('_').pop() || '3'))
    }
    if (match.config.league_name) setLeagueName(match.config.league_name)
    if (match.config.tournament_name)
      setTournamentName(match.config.tournament_name)
    if (match.config.match_info) setMatchInfo(match.config.match_info)
    if (match.config.show_team_logos !== undefined)
      setShowTeamLogos(match.config.show_team_logos)
    if (match.config.is_ticker_visible !== undefined)
      setIsTickerVisible(match.config.is_ticker_visible)

    // Hydrate players from participants if they exist
    // @ts-ignore: Dynamic access to nested participants object
    if (match.participants.team_1?.player_1?.id)
      // @ts-ignore: Dynamic access to nested participants object
      setTeam1Player1Id(match.participants.team_1.player_1.id.toString())
    // @ts-ignore: Dynamic access to nested participants object
    if (match.participants.team_1?.player_2?.id)
      // @ts-ignore: Dynamic access to nested participants object
      setTeam1Player2Id(match.participants.team_1.player_2.id.toString())
    // @ts-ignore: Dynamic access to nested participants object
    if (match.participants.team_2?.player_1?.id)
      // @ts-ignore: Dynamic access to nested participants object
      setTeam2Player1Id(match.participants.team_2.player_1.id.toString())
    // @ts-ignore: Dynamic access to nested participants object
    if (match.participants.team_2?.player_2?.id)
      // @ts-ignore: Dynamic access to nested participants object
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
        status: match.status === 'preparing' ? 'in_progress' : match.status,
        config: {
          ...match.config,
          format: `best_of_${bestOf}`,
          league_name: leagueName,
          tournament_name: tournamentName,
          match_info: matchInfo,
          show_team_logos: showTeamLogos,
          is_ticker_visible: isTickerVisible,
        },
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

  const swapSidesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${config.API_URL}/matches/${match.public_id}/swap-teams`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error('Failed to swap teams')
      return res.json()
    },
    onSuccess: (updatedMatch) => {
      queryClient.setQueryData(['match', match.public_id], updatedMatch)
    },
  })

  if (teamsLoading || playersLoading) return <Spinner />

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
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-between items-center bg-slate-800 hover:bg-slate-750 p-4 border-b border-slate-700 w-full font-bold text-lime-400 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5" /> Match Configuration
          {isStarted && (
            <span className="bg-lime-500/20 px-2 py-0.5 rounded text-[10px] text-lime-500 uppercase">
              Locked
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-slate-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-500" />
        )}
      </button>
      {isOpen && (
        <div className="p-6 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-center mb-6">
            <button
              onClick={() => swapSidesMutation.mutate()}
              disabled={swapSidesMutation.isPending || !team1Id || !team2Id}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-6 py-2 border border-slate-600 hover:border-slate-500 rounded-full font-bold text-slate-200 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightLeft className="w-4 h-4" /> Swap Sides (Home/Away)
            </button>
          </div>

          {/* Event Details */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4 font-semibold text-slate-300 text-sm uppercase tracking-wider">
              <Trophy className="w-4 h-4" /> Event Details
            </div>
            <div className="gap-4 grid grid-cols-1 md:grid-cols-3 mb-4">
              <div>
                <label className="block mb-1 text-slate-400 text-xs">
                  League Name
                </label>
                <input
                  type="text"
                  value={leagueName}
                  onChange={(e) => setLeagueName(e.target.value)}
                  className="bg-slate-900 px-4 py-2 border border-slate-700 rounded-lg w-full text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                  placeholder="e.g. Global Padel Association"
                />
              </div>
              <div>
                <label className="block mb-1 text-slate-400 text-xs">
                  Tournament Name
                </label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  className="bg-slate-900 px-4 py-2 border border-slate-700 rounded-lg w-full text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                  placeholder="e.g. Nebula Padel Open"
                />
              </div>
              <div>
                <label className="block mb-1 text-slate-400 text-xs">
                  Match Info / Round
                </label>
                <input
                  type="text"
                  value={matchInfo}
                  onChange={(e) => setMatchInfo(e.target.value)}
                  className="bg-slate-900 px-4 py-2 border border-slate-700 rounded-lg w-full text-white focus:outline-none focus:ring-2 focus:ring-lime-500"
                  placeholder="e.g. Quarter-Finals"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTeamLogos}
                  onChange={(e) => setShowTeamLogos(e.target.checked)}
                  className="rounded text-lime-500 focus:ring-lime-500"
                />
                <span className="text-slate-300 text-sm">
                  Show Team Logos on Ticker
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTickerVisible}
                  onChange={(e) => setIsTickerVisible(e.target.checked)}
                  className="rounded text-lime-500 focus:ring-lime-500"
                />
                <span className="text-slate-300 text-sm">
                  Broadcast Ticker Visible
                </span>
              </label>
            </div>
          </div>

          <div className="gap-8 grid grid-cols-1 md:grid-cols-2">
            <TeamConfigCard
              label="Team 1 (Home)"
              teamId={team1Id}
              otherTeamId={team2Id}
              player1Id={team1Player1Id}
              player2Id={team1Player2Id}
              teams={teams || []}
              players={players || []}
              onTeamChange={setTeam1Id}
              onPlayer1Change={setTeam1Player1Id}
              onPlayer2Change={setTeam1Player2Id}
              onSwap={() => swapPlayers(1)}
              onCreateTeam={() => setIsCreatingTeam(true)}
            />

            <TeamConfigCard
              label="Team 2 (Away)"
              teamId={team2Id}
              otherTeamId={team1Id}
              player1Id={team2Player1Id}
              player2Id={team2Player2Id}
              teams={teams || []}
              players={players || []}
              onTeamChange={setTeam2Id}
              onPlayer1Change={setTeam2Player1Id}
              onPlayer2Change={setTeam2Player2Id}
              onSwap={() => swapPlayers(2)}
              onCreateTeam={() => setIsCreatingTeam(true)}
            />
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

          {/* Series Length */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4 font-semibold text-slate-300 text-sm uppercase tracking-wider">
              <Trophy className="w-4 h-4" /> Series Length
            </div>
            <div className="flex gap-4">
              {[1, 3, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => setBestOf(num)}
                  disabled={isStarted}
                  className={`flex-1 p-3 rounded-lg border-2 transition-all ${
                    bestOf === num
                      ? 'border-lime-500 bg-lime-500/10 text-lime-400 font-bold'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                  } ${isStarted ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Best of {num}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end mt-6 pt-4 border-t border-slate-700">
            <button
              onClick={() => configureMutation.mutate()}
              disabled={!team1Id || !team2Id || configureMutation.isPending}
              className={`px-8 py-3 rounded-lg font-bold text-white transition-all shadow-lg disabled:opacity-50 ${
                match.status === 'preparing'
                  ? 'bg-green-600 hover:bg-green-500 ring-2 ring-green-500/20'
                  : 'bg-lime-600 hover:bg-lime-500'
              }`}
            >
              {configureMutation.isPending
                ? 'Updating...'
                : match.status === 'preparing'
                  ? 'Start Match'
                  : 'Update Match Configuration'}
            </button>
          </div>
        </div>
      )}{' '}
      {isCreatingTeam && players && (
        <CreateTeamModal
          players={players}
          onClose={() => setIsCreatingTeam(false)}
        />
      )}
    </div>
  )
}
