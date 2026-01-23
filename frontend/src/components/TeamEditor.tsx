import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Search } from 'lucide-react'
import config from '../config'
import { CreatePlayerModal } from './CreatePlayerModal'
import type { Player } from '../types/domain'

interface TeamEditorProps {
  players: Array<Player>
  onSuccess: () => void
  onCancel?: () => void
  initialData?: {
    id?: number | null
    name: string
    short_name: string
    primary_color: string
    player_ids: Array<number>
  }
}

export function TeamEditor({
  players,
  onSuccess,
  onCancel,
  initialData,
}: TeamEditorProps) {
  const queryClient = useQueryClient()

  // Form State
  const [name, setName] = useState(initialData?.name || '')
  const [shortName, setShortName] = useState(initialData?.short_name || '')
  const [color, setColor] = useState(initialData?.primary_color || '#3b82f6')

  // Ensure selected players actually exist in the passed players list
  const validInitialIds = (initialData?.player_ids || []).filter((id) =>
    players.some((p) => p.id === id),
  )
  const [selectedPlayers, setSelectedPlayers] =
    useState<Array<number>>(validInitialIds)

  // UI State
  const [search, setSearch] = useState('')
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false)

  const createMutation = useMutation({
    mutationFn: async () => {
      const url = initialData?.id
        ? `${config.API_URL}/teams/${initialData.id}`
        : `${config.API_URL}/teams`

      const method = initialData?.id ? 'PUT' : 'POST'

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          short_name: shortName,
          primary_color: color,
          player_ids: selectedPlayers,
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      onSuccess()
    },
  })

  const togglePlayer = (id: number) => {
    if (selectedPlayers.includes(id)) {
      setSelectedPlayers(selectedPlayers.filter((p) => p !== id))
    } else if (selectedPlayers.length < 2) {
      setSelectedPlayers([...selectedPlayers, id])
    }
  }

  const filteredPlayers = players.filter((p) =>
    p.display_name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      {/* Basic Info Section */}
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-slate-400 text-xs uppercase font-bold">
            Team Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none transition-all"
            placeholder="e.g. Nashville Night Owls"
          />
        </div>

        <div className="gap-4 grid grid-cols-2">
          <div>
            <label className="mb-1 block text-slate-400 text-xs uppercase font-bold">
              Abbreviation
            </label>
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value.toUpperCase())}
              className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none transition-all"
              placeholder="NSH"
              maxLength={4}
            />
          </div>
          <div>
            <label className="mb-1 block text-slate-400 text-xs uppercase font-bold">
              Color
            </label>
            <div className="flex items-center gap-2 bg-slate-900 border-slate-700 p-2 border rounded-lg h-[50px]">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="bg-transparent w-full h-full cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Player Selection Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label className="block text-slate-400 text-xs uppercase font-bold">
            Select Players ({selectedPlayers.length}/2)
          </label>
          <button
            onClick={() => setIsCreatingPlayer(true)}
            className="flex items-center gap-1 text-lime-500 hover:text-lime-400 text-xs font-bold transition-colors"
          >
            <Plus className="w-4 h-4" /> Create New Player
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="top-3 left-3 absolute w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="bg-slate-900 border-slate-700 pl-10 p-2 border rounded-lg w-full text-sm text-white focus:border-slate-500 outline-none"
          />
        </div>

        {/* Player Grid */}
        <div className="gap-2 grid grid-cols-2 bg-slate-900/50 p-2 rounded-xl max-h-60 overflow-y-auto">
          {filteredPlayers.map((player) => {
            const isSelected = selectedPlayers.includes(player.id!)
            return (
              <button
                key={player.id}
                onClick={() => togglePlayer(player.id!)}
                className={`
                  flex items-center justify-between p-3 rounded-lg border text-sm text-left transition-all
                  ${
                    isSelected
                      ? 'bg-lime-500/20 border-lime-500/50 text-white shadow-[0_0_10px_rgba(132,204,22,0.1)]'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:bg-slate-750'
                  }
                `}
              >
                <span className="truncate font-medium">
                  {player.display_name}
                </span>
                {isSelected && <Check className="w-4 h-4 text-lime-500" />}
              </button>
            )
          })}
          {filteredPlayers.length === 0 && (
            <div className="col-span-2 py-4 text-center text-slate-500 text-xs italic">
              No players found matching "{search}"
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold text-slate-300 transition-all"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => createMutation.mutate()}
          disabled={
            !name || selectedPlayers.length < 2 || createMutation.isPending
          }
          className="flex-1 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 py-3 rounded-xl font-bold text-slate-900 transition-all"
        >
          {createMutation.isPending
            ? 'Saving...'
            : initialData?.id
              ? 'Update Team'
              : 'Create Team'}
        </button>
      </div>

      {isCreatingPlayer && (
        <CreatePlayerModal onClose={() => setIsCreatingPlayer(false)} />
      )}
    </div>
  )
}
