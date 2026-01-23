import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import config from '../config'
import type { Player } from '../types/domain'

interface PlayerEditorProps {
  onSuccess: () => void
  onCancel?: () => void
  initialData?: Player
}

export function PlayerEditor({ onSuccess, onCancel, initialData }: PlayerEditorProps) {
  const queryClient = useQueryClient()
  
  // Form State
  const [name, setName] = useState(initialData?.display_name || '')
  const [handedness, setHandedness] = useState(initialData?.handedness || 'right')
  const [rating, setRating] = useState(initialData?.skill_rating?.toString() || '')

  const mutation = useMutation({
    mutationFn: async () => {
      const url = initialData 
        ? `${config.API_URL}/players/${initialData.id}` 
        : `${config.API_URL}/players`
        
      const method = initialData ? 'PUT' : 'POST'

      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: name,
          handedness,
          skill_rating: rating ? parseFloat(rating) : undefined,
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      onSuccess()
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-slate-400 text-xs uppercase font-bold">Display Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none transition-all"
          placeholder="e.g. Jane Doe"
          autoFocus
        />
      </div>

      <div className="gap-4 grid grid-cols-2">
        <div>
          <label className="mb-1 block text-slate-400 text-xs uppercase font-bold">Handedness</label>
          <select
            value={handedness}
            onChange={(e) => setHandedness(e.target.value)}
            className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none transition-all"
          >
            <option value="right">Right</option>
            <option value="left">Left</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-slate-400 text-xs uppercase font-bold">Rating (Optional)</label>
          <input
            type="number"
            step="0.1"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none transition-all"
            placeholder="3.5"
          />
        </div>
      </div>

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
          onClick={() => mutation.mutate()}
          disabled={!name || mutation.isPending}
          className="flex-1 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 py-3 rounded-xl font-bold text-slate-900 transition-all"
        >
          {mutation.isPending ? 'Saving...' : initialData ? 'Update Player' : 'Create Player'}
        </button>
      </div>
    </div>
  )
}
