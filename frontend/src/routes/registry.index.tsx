import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Users, User, Shirt, Plus } from 'lucide-react'
import config from '../config'

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
                activeTab === 'players' ? 'bg-lime-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" /> Players
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                activeTab === 'teams' ? 'bg-lime-600 text-white font-bold' : 'text-slate-400 hover:text-white'
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
  const [name, setName] = useState('')
  const [handedness, setHandedness] = useState('right')
  const [rating, setRating] = useState('')

  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/players`)
      return res.json()
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${config.API_URL}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          display_name: name,
          handedness,
          skill_rating: rating ? parseFloat(rating) : undefined
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      setName('')
      setRating('')
    }
  })

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <div className="bg-slate-800 p-6 border border-slate-700 rounded-xl">
        <h3 className="mb-4 font-semibold text-lg">Add New Player</h3>
        <div className="flex gap-4">
          <input
            className="flex-1 bg-slate-900 px-4 py-2 border border-slate-700 rounded text-white"
            placeholder="Display Name (e.g. John Doe)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <select
            className="bg-slate-900 px-4 py-2 border border-slate-700 rounded text-white"
            value={handedness}
            onChange={e => setHandedness(e.target.value)}
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
          <input
            className="bg-slate-900 px-4 py-2 border border-slate-700 rounded text-white w-24"
            placeholder="Rating"
            type="number"
            step="0.1"
            value={rating}
            onChange={e => setRating(e.target.value)}
          />
          <button
            disabled={!name || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="flex items-center gap-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 px-6 py-2 rounded font-bold transition-colors"
          >
            <Plus className="w-5 h-5" /> Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="gap-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {players?.map((player: any) => (
          <div key={player.id} className="flex justify-between items-center bg-slate-800 p-4 border border-slate-700 rounded-lg">
            <div>
              <div className="font-bold text-lg">{player.display_name}</div>
              <div className="flex gap-2 text-slate-400 text-xs uppercase">
                <span>{player.handedness}</span>
                {player.skill_rating && <span>• {player.skill_rating}</span>}
              </div>
            </div>
            <div className="bg-slate-900 p-2 rounded-full text-slate-500">
              <User className="w-5 h-5" />
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
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([])

  // Fetch both teams and players (for selection)
  const { data: teams } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/teams`)
      return res.json()
    }
  })

  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/players`)
      return res.json()
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${config.API_URL}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name,
          short_name: shortName,
          primary_color: color,
          player_ids: selectedPlayers
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setName('')
      setShortName('')
      setSelectedPlayers([])
    }
  })

  const togglePlayer = (id: number) => {
    if (selectedPlayers.includes(id)) {
      setSelectedPlayers(selectedPlayers.filter(p => p !== id))
    } else {
      setSelectedPlayers([...selectedPlayers, id])
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Form */}
      <div className="space-y-4 bg-slate-800 p-6 border border-slate-700 rounded-xl">
        <h3 className="font-semibold text-lg">Create Team</h3>
        <div className="gap-4 grid grid-cols-1 md:grid-cols-3">
          <input
            className="col-span-2 bg-slate-900 px-4 py-2 border border-slate-700 rounded text-white"
            placeholder="Team Name (e.g. Nashville Night Owls)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            className="bg-slate-900 px-4 py-2 border border-slate-700 rounded text-white"
            placeholder="Abbr (NSH)"
            maxLength={4}
            value={shortName}
            onChange={e => setShortName(e.target.value.toUpperCase())}
          />
        </div>
        
        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm">Primary Color:</span>
          <input 
            type="color" 
            value={color} 
            onChange={e => setColor(e.target.value)}
            className="bg-transparent w-12 h-8 cursor-pointer"
          />
        </div>

        <div>
          <label className="mb-2 block text-slate-400 text-sm">Select Players:</label>
          <div className="gap-2 grid grid-cols-2 md:grid-cols-4 bg-slate-900 p-4 rounded-lg max-h-40 overflow-y-auto">
            {players?.map((player: any) => (
              <button
                key={player.id}
                onClick={() => togglePlayer(player.id)}
                className={`text-sm p-2 rounded text-left truncate transition-colors ${
                  selectedPlayers.includes(player.id)
                    ? 'bg-lime-600/20 text-lime-400 border border-lime-600/50'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {player.display_name}
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!name || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="bg-lime-600 hover:bg-lime-500 disabled:opacity-50 px-6 py-2 rounded-lg w-full font-bold transition-colors"
        >
          Create Team
        </button>
      </div>

      {/* Team List */}
      <div className="gap-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {teams?.map((team: any) => (
          <div key={team.id} className="relative bg-slate-800 p-6 border border-slate-700 rounded-xl overflow-hidden">
            <div 
              className="top-0 left-0 absolute w-1 h-full"
              style={{ backgroundColor: team.primary_color }}
            />
            <div className="flex justify-between items-start pl-2">
              <div>
                <h3 className="font-bold text-xl">{team.name}</h3>
                <div className="font-mono text-slate-500 text-xs">{team.short_name}</div>
              </div>
              <Shirt className="w-6 h-6 text-slate-600" />
            </div>
            
            <div className="flex flex-wrap gap-2 mt-4 pl-2">
              {team.player_ids?.map((pid: number) => {
                const p = players?.find((x: any) => x.id === pid)
                return p ? (
                  <span key={pid} className="bg-slate-900 px-2 py-1 border border-slate-700 rounded text-slate-300 text-xs">
                    {p.display_name}
                  </span>
                ) : null
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
