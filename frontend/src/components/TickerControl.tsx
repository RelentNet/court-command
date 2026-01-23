import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, MonitorOff } from 'lucide-react'
import config from '../config'
import type { Court } from '../types/domain'

interface TickerControlProps {
  court: Court
  className?: string
}

export function TickerControl({ court, className = '' }: TickerControlProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (isVisible: boolean) => {
      const res = await fetch(`${config.API_URL}/courts/${court.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_ticker_visible: isVisible }),
      })
      if (!res.ok) throw new Error('Failed to update ticker visibility')
      return res.json()
    },
    onSuccess: (updatedCourt) => {
      // Update individual court cache
      queryClient.setQueryData(['court', court.slug], (old: any) => ({
        ...old,
        ...updatedCourt,
      }))

      // Update list cache (for /tickers page)
      queryClient.setQueryData(['courts'], (oldCourts: Court[] | undefined) => {
        if (!oldCourts) return oldCourts
        return oldCourts.map((c) =>
          c.slug === court.slug ? { ...c, ...updatedCourt } : c,
        )
      })
    },
  })

  const isVisible = court.is_ticker_visible ?? true

  return (
    <div
      className={`flex justify-between items-center bg-slate-800 p-4 border border-slate-700 rounded-xl shadow-lg ${className}`}
    >
      <div className="flex items-center gap-3">
        {isVisible ? (
          <Monitor className="w-6 h-6 text-lime-500" />
        ) : (
          <MonitorOff className="w-6 h-6 text-slate-500" />
        )}
        <div>
          <h3 className="font-bold text-sm text-white uppercase tracking-wider">
            Broadcast Ticker
          </h3>
          <p className="text-slate-400 text-xs">
            {isVisible ? 'Visible on overlay' : 'Hidden from overlay'}
          </p>
        </div>
      </div>

      <button
        onClick={() => mutation.mutate(!isVisible)}
        disabled={mutation.isPending}
        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-lime-500 focus:ring-offset-2 focus:ring-offset-slate-900 cursor-pointer ${
          isVisible ? 'bg-lime-600' : 'bg-slate-600'
        }`}
      >
        <span
          className={`${
            isVisible ? 'translate-x-7' : 'translate-x-1'
          } inline-block h-6 w-6 transform rounded-full bg-white transition-transform`}
        />
      </button>
    </div>
  )
}
