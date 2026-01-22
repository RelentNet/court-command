import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import config from '../config'

interface CreatePlayerModalProps {
  onClose: () => void
}

export function CreatePlayerModal({ onClose }: CreatePlayerModalProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [handedness, setHandedness] = useState('right')
  const [rating, setRating] = useState('')

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${config.API_URL}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: name,
          handedness,
          skill_rating: rating ? parseFloat(rating) : undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to create player')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      onClose()
    },
  })

  return (
    <div className="z-[60] fixed inset-0 flex justify-center items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 shadow-2xl rounded-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center bg-slate-900 p-4 border-b border-slate-700">
          <h3 className="font-bold text-white text-lg">Create New Player</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-slate-400 text-xs">Display Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-900 border-slate-600 p-2 border rounded w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
              placeholder="e.g. Jane Doe"
              autoFocus
            />
          </div>

          <div className="gap-4 grid grid-cols-2">
            <div>
              <label className="mb-1 block text-slate-400 text-xs">Handedness</label>
              <select
                value={handedness}
                onChange={(e) => setHandedness(e.target.value)}
                className="bg-slate-900 border-slate-600 p-2 border rounded w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400 text-xs">Rating (Optional)</label>
              <input
                type="number"
                step="0.1"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="bg-slate-900 border-slate-600 p-2 border rounded w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
                placeholder="3.5"
              />
            </div>
          </div>

          <button
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
            className="flex justify-center items-center gap-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 mt-4 py-3 rounded-lg w-full font-bold text-white transition-all"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Player'}
          </button>
        </div>
      </div>
    </div>
  )
}
