import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pencil, Plus, Shirt, Trash2, User, Users } from 'lucide-react'
import config from '../config'
import { TeamEditor } from '../components/TeamEditor'
import { PlayerEditor } from '../components/PlayerEditor'
import type { Player, Team } from '../types/domain'

export const Route = createFileRoute('/registry/')({
  component: RegistryDashboard,
})

type Tab = 'players' | 'teams'

function RegistryDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('players')

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-8 mx-auto max-w-5xl">
        <div className="flex justify-between items-center">
          <h1 className="font-bold text-3xl">Registry</h1>

          {/* Tab Switcher */}
          <div className="flex bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('players')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                activeTab === 'players'
                  ? 'bg-lime-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" /> Players
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                activeTab === 'teams'
                  ? 'bg-lime-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" /> Teams
            </button>
          </div>
        </div>

        {activeTab === 'players' ? <PlayersPanel /> : <TeamsPanel />}
      </div>
    </div>
  )
}

// --- Players Panel ---

function PlayersPanel() {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  const { data: players } = useQuery<Array<Player>>({
    queryKey: ['players'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/players`)
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${config.API_URL}/players/${id}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
    },
  })

  if (isCreating || editingPlayer) {
    return (
      <div className="bg-slate-800 p-6 border border-slate-700 rounded-xl">
        <h3 className="mb-6 font-bold text-xl">
          {editingPlayer ? 'Edit Player' : 'Create New Player'}
        </h3>
        <PlayerEditor
          onSuccess={() => {
            setIsCreating(false)
            setEditingPlayer(null)
          }}
          onCancel={() => {
            setIsCreating(false)
            setEditingPlayer(null)
          }}
          initialData={editingPlayer || undefined}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-lime-600 hover:bg-lime-500 px-4 py-2 rounded-lg font-bold transition-colors"
        >
          <Plus className="w-5 h-5" /> Add Player
        </button>
      </div>

      {/* List */}
      <div className="gap-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {players?.map((player: Player) => (
          <div
            key={player.id}
            className="flex justify-between items-center bg-slate-800 p-4 border border-slate-700 rounded-lg group"
          >
            <div>
              <div className="font-bold text-lg">{player.display_name}</div>
              <div className="flex gap-2 text-slate-400 text-xs uppercase">
                <span>{player.handedness}</span>
                {player.skill_rating && <span>• {player.skill_rating}</span>}
              </div>
            </div>

            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setEditingPlayer(player)}
                className="text-slate-600 hover:text-blue-500 transition-colors"
                aria-label={`Edit ${player.display_name}`}
              >
                <Pencil className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${player.display_name}?`)) {
                    deleteMutation.mutate(player.id!)
                  }
                }}
                className="text-slate-600 hover:text-red-500 transition-colors"
                aria-label={`Delete ${player.display_name}`}
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Teams Panel ---

function TeamsPanel() {
  const queryClient = useQueryClient()

  const [isCreating, setIsCreating] = useState(false)

  const [editingTeam, setEditingTeam] = useState<Team | null>(null)

  // Fetch both teams and players (for selection)

  const { data: teams } = useQuery<Array<Team>>({
    queryKey: ['teams'],

    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/teams`)

      return res.json()
    },
  })

  const { data: players } = useQuery<Array<Player>>({
    queryKey: ['players'],

    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/players`)

      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${config.API_URL}/teams/${id}`, {
        method: 'DELETE',
      })
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
  })

  if (isCreating || editingTeam) {
    return (
      <div className="bg-slate-800 p-6 border border-slate-700 rounded-xl">
        <h3 className="mb-6 font-bold text-xl">
          {editingTeam ? 'Edit Team' : 'Create New Team'}
        </h3>

        <TeamEditor
          players={players || []}
          onSuccess={() => {
            setIsCreating(false)

            setEditingTeam(null)
          }}
          onCancel={() => {
            setIsCreating(false)

            setEditingTeam(null)
          }}
          initialData={
            editingTeam
              ? {
                  id: editingTeam.id,

                  name: editingTeam.name,

                  short_name: editingTeam.short_name || '',

                  primary_color: editingTeam.primary_color || '#3b82f6',

                  player_ids: editingTeam.player_ids,
                }
              : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-lime-600 hover:bg-lime-500 px-4 py-2 rounded-lg font-bold transition-colors"
        >
          <Plus className="w-5 h-5" /> Create Team
        </button>
      </div>

      {/* Team List */}

      <div className="gap-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {teams?.map((team: Team) => (
          <div
            key={team.id}
            className="relative bg-slate-800 p-6 border border-slate-700 rounded-xl overflow-hidden group"
          >
            <div
              className="top-0 left-0 absolute w-1 h-full"
              style={{ backgroundColor: team.primary_color || undefined }}
            />

            <div className="flex justify-between items-start pl-2">
              <div>
                <h3 className="font-bold text-xl">{team.name}</h3>

                <div className="font-mono text-slate-500 text-xs">
                  {team.short_name}
                </div>
              </div>

              <Shirt className="w-6 h-6 text-slate-600" />
            </div>

            <div className="flex flex-wrap gap-2 mt-4 pl-2">
              {team.player_ids.map((pid: number) => {
                const p = players?.find((x: Player) => x.id === pid)

                return p ? (
                  <span
                    key={pid}
                    className="bg-slate-900 px-2 py-1 border border-slate-700 rounded text-slate-300 text-xs"
                  >
                    {p.display_name}
                  </span>
                ) : null
              })}
            </div>

            <div className="top-4 right-4 absolute flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Edit functionality not fully wired in backend yet, but UI ready */}

              <button
                onClick={() => setEditingTeam(team)}
                className="bg-slate-900/50 hover:bg-blue-500/20 p-2 rounded text-slate-500 hover:text-blue-500 transition-all"
                aria-label={`Edit ${team.name}`}
              >
                <Pencil className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (confirm(`Delete ${team.name}?`)) {
                    deleteMutation.mutate(team.id!)
                  }
                }}
                className="bg-slate-900/50 hover:bg-red-500/20 p-2 rounded text-slate-500 hover:text-red-500 transition-all"
                aria-label={`Delete ${team.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
