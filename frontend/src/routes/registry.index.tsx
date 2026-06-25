import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  Download,
  Pencil,
  Plus,
  Settings,
  Shirt,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react'
import config from '../config'
import { TeamEditor } from '../components/TeamEditor'
import { PlayerEditor } from '../components/PlayerEditor'
import { parsePlayersCsv, playersToCsv } from '../utils/playerCsv'
import type { MatchPreset, Player, Team } from '../types/domain'

export const Route = createFileRoute('/registry/')({
  component: RegistryDashboard,
})

type Tab = 'players' | 'teams' | 'presets'

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
            <button
              onClick={() => setActiveTab('presets')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                activeTab === 'presets'
                  ? 'bg-lime-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" /> Presets
            </button>
          </div>
        </div>

        {activeTab === 'players' && <PlayersPanel />}
        {activeTab === 'teams' && <TeamsPanel />}
        {activeTab === 'presets' && <PresetsPanel />}
      </div>
    </div>
  )
}

// --- Presets Panel ---

function PresetsPanel() {
  const queryClient = useQueryClient()
  const [newCategory, setNewCategory] = useState<'league' | 'tournament' | 'round'>('league')
  const [newValue, setNewValue] = useState('')

  const { data: presets } = useQuery<Array<MatchPreset>>({
    queryKey: ['presets'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/presets`)
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (preset: Partial<MatchPreset>) => {
      await fetch(`${config.API_URL}/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preset),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presets'] })
      setNewValue('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${config.API_URL}/presets/${id}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['presets'] })
    },
  })

  const categories: Array<{ id: typeof newCategory; label: string }> = [
    { id: 'league', label: 'Leagues' },
    { id: 'tournament', label: 'Tournaments' },
    { id: 'round', label: 'Match Info / Rounds' },
  ]

  return (
    <div className="space-y-8">
      {/* Quick Add */}
      <div className="bg-slate-800 p-6 border border-slate-700 rounded-xl">
        <h3 className="mb-4 font-bold text-xl">Add New Preset</h3>
        <div className="flex gap-4">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as any)}
            className="bg-slate-900 border-slate-700 px-4 py-2 border rounded-lg text-white"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={`Enter ${newCategory} name...`}
            className="flex-1 bg-slate-900 border-slate-700 px-4 py-2 border rounded-lg text-white"
          />
          <button
            onClick={() => createMutation.mutate({ category: newCategory, value: newValue })}
            disabled={!newValue || createMutation.isPending}
            className="bg-lime-600 hover:bg-lime-500 disabled:opacity-50 px-6 py-2 rounded-lg font-bold"
          >
            Add
          </button>
        </div>
      </div>

      <div className="gap-8 grid grid-cols-1 md:grid-cols-3">
        {categories.map((cat) => (
          <div key={cat.id} className="space-y-4">
            <h4 className="flex items-center gap-2 font-bold text-lime-400 uppercase tracking-wider text-sm">
              {cat.label}
            </h4>
            <div className="space-y-2">
              {presets
                ?.filter((p) => p.category === cat.id)
                .map((preset) => (
                  <div
                    key={preset.id}
                    className="flex justify-between items-center bg-slate-800 px-4 py-2 border border-slate-700 rounded-lg group"
                  >
                    <span>{preset.value}</span>
                    <button
                      onClick={() => deleteMutation.mutate(preset.id!)}
                      className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              {presets?.filter((p) => p.category === cat.id).length === 0 && (
                <div className="italic text-slate-500 text-sm">No {cat.label.toLowerCase()} added yet.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Players Panel ---

function PlayersPanel() {
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      const rows = parsePlayersCsv(text)
      if (rows.length === 0) {
        throw new Error('No valid player rows found in file.')
      }

      // Skip names that already exist (case-insensitive) to avoid duplicates.
      const existing = new Set(
        (players ?? []).map((p) => p.display_name.trim().toLowerCase()),
      )

      let imported = 0
      let skipped = 0
      let failed = 0

      for (const row of rows) {
        const key = row.display_name.trim().toLowerCase()
        if (existing.has(key)) {
          skipped++
          continue
        }
        existing.add(key)
        try {
          const res = await fetch(`${config.API_URL}/players`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              display_name: row.display_name,
              handedness: row.handedness,
              skill_rating: row.skill_rating,
            }),
          })
          if (!res.ok) throw new Error(String(res.status))
          imported++
        } catch {
          failed++
        }
      }

      return { imported, skipped, failed, total: rows.length }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      const parts = [`${result.imported} imported`]
      if (result.skipped) parts.push(`${result.skipped} skipped (duplicate)`)
      if (result.failed) parts.push(`${result.failed} failed`)
      alert(`Import complete: ${parts.join(', ')}.`)
    },
    onError: (error: unknown) => {
      alert(
        `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    },
  })

  const handleExport = () => {
    const csv = playersToCsv(players ?? [])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'players.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) importMutation.mutate(file)
    e.target.value = '' // allow re-importing the same file
  }

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
      <div className="flex flex-wrap justify-end gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importMutation.isPending}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-4 py-2 border border-slate-700 rounded-lg font-bold transition-colors"
        >
          <Upload className="w-5 h-5" />{' '}
          {importMutation.isPending ? 'Importing...' : 'Import CSV'}
        </button>
        <button
          onClick={handleExport}
          disabled={!players || players.length === 0}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 px-4 py-2 border border-slate-700 rounded-lg font-bold transition-colors"
        >
          <Download className="w-5 h-5" /> Export CSV
        </button>
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
