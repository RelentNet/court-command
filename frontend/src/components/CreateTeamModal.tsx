import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import config from '../config'
import { CreatePlayerModal } from './CreatePlayerModal'
import type { Player } from '../types/domain'

interface CreateTeamModalProps {
  players: Array<Player>
  onClose: () => void
}

export function CreateTeamModal({ players, onClose }: CreateTeamModalProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [selectedPlayers, setSelectedPlayers] = useState<Array<number>>([])
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false)

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${config.API_URL}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          short_name: shortName,
          primary_color: color,
          player_ids: selectedPlayers,
        }),
      })
      if (!res.ok) throw new Error('Failed to create team')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      onClose()
    },
  })

  const togglePlayer = (id: number) => {
    if (selectedPlayers.includes(id)) {
      setSelectedPlayers(selectedPlayers.filter((p) => p !== id))
    } else if (selectedPlayers.length < 2) {
      setSelectedPlayers([...selectedPlayers, id])
    }
  }

  return (
    <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center bg-slate-900 p-4 border-b border-slate-700">
          <h3 className="font-bold text-white text-lg">Create New Team</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-slate-400 text-xs">
              Team Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-900 border-slate-600 p-2 border rounded w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
              placeholder="e.g. Thunderbirds"
            />
          </div>

          <div className="gap-4 grid grid-cols-2">
            <div>
              <label className="mb-1 block text-slate-400 text-xs">
                Abbreviation
              </label>
              <input
                value={shortName}
                onChange={(e) => setShortName(e.target.value.toUpperCase())}
                className="bg-slate-900 border-slate-600 p-2 border rounded w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
                placeholder="TBR"
                maxLength={4}
              />
            </div>
            <div>
              <label className="mb-1 block text-slate-400 text-xs">Color</label>
              <div className="flex items-center gap-2 bg-slate-900 border-slate-600 p-1 border rounded">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="bg-transparent w-8 h-8 cursor-pointer"
                />
                <span className="text-slate-400 text-xs">{color}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-slate-400 text-xs">
                Select 2 Players ({selectedPlayers.length}/2)
              </label>
              <button
                onClick={() => setIsCreatingPlayer(true)}
                className="flex items-center gap-1 text-lime-500 hover:text-lime-400 text-xs transition-colors"
              >
                <Plus className="w-3 h-3" /> New Player
              </button>
            </div>
            <div className="gap-2 grid grid-cols-2 bg-slate-900 p-2 rounded-lg max-h-32 overflow-y-auto">
              {players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => togglePlayer(player.id!)}
                  className={`text-xs p-2 rounded text-left truncate transition-colors ${
                    selectedPlayers.includes(player.id!)
                      ? 'bg-lime-600/20 text-lime-400 border border-lime-600/50'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'
                  }`}
                >
                  {player.display_name}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => createMutation.mutate()}
            disabled={
              !name || selectedPlayers.length !== 2 || createMutation.isPending
            }
            className="flex justify-center items-center gap-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 mt-4 py-3 rounded-lg w-full font-bold text-white transition-all"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Team'}
          </button>
        </div>
      </div>

      {isCreatingPlayer && (
        <CreatePlayerModal onClose={() => setIsCreatingPlayer(false)} />
      )}
    </div>
  )
}
