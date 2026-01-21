import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus } from 'lucide-react'
import { useState } from 'react'
import config from '../config'

export const Route = createFileRoute('/courts/')({
  component: CourtsDashboard,
})

function CourtsDashboard() {
  const queryClient = useQueryClient()
  const [newCourtName, setNewCourtName] = useState('')

  const { data: courts, isLoading } = useQuery({
    queryKey: ['courts'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/courts`)
      if (!res.ok) throw new Error('Failed to fetch courts')
      return res.json()
    },
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${config.API_URL}/courts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Failed to create court')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courts'] })
      setNewCourtName('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`${config.API_URL}/courts/${slug}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete court')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courts'] })
    },
  })

  if (isLoading) return <div className="p-8 text-white">Loading courts...</div>

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-8 mx-auto max-w-4xl">
        <h1 className="font-bold text-3xl">Court Management</h1>

        {/* Create Court */}
        <div className="flex gap-4 bg-slate-800 p-4 rounded-lg">
          <input
            type="text"
            value={newCourtName}
            onChange={(e) => setNewCourtName(e.target.value)}
            placeholder="Enter court name (e.g. Center Court)"
            className="flex-1 bg-slate-700 px-4 py-2 rounded text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newCourtName.trim()) {
                createMutation.mutate(newCourtName)
              }
            }}
          />
          <button
            onClick={() => {
              if (newCourtName.trim()) createMutation.mutate(newCourtName)
            }}
            disabled={createMutation.isPending || !newCourtName.trim()}
            className="flex items-center gap-2 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 px-6 py-2 rounded font-bold transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create
          </button>
        </div>

        {/* Court List */}
        <div className="gap-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {courts?.map((court: any) => (
            <div
              key={court.id}
              className="group flex flex-col justify-between bg-slate-800 hover:bg-slate-750 p-6 border border-slate-700 hover:border-lime-500/50 rounded-xl transition-all"
            >
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-xl">{court.name}</h3>
                  {court.is_active && (
                    <span className="flex items-center gap-1 bg-lime-500/20 px-2 py-1 rounded-full text-lime-500 text-xs font-bold uppercase tracking-wider animate-pulse">
                      <span className="w-2 h-2 bg-lime-500 rounded-full" /> Live
                    </span>
                  )}
                </div>
                <code className="mt-1 block text-slate-500 text-xs">/{court.slug}</code>
              </div>
              
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-700">
                <Link 
                   to="/courts/$courtSlug" 
                   params={{ courtSlug: court.slug }}
                   className="text-lime-500 text-sm hover:underline"
                >
                  View Court &rarr;
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${court.name}?`)) {
                      deleteMutation.mutate(court.slug)
                    }
                  }}
                  className="text-slate-600 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
          
          {courts?.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">
              No courts created yet. Add one above!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
