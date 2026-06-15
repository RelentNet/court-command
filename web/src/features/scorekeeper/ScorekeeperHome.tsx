// web/src/features/scorekeeper/ScorekeeperHome.tsx
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Skeleton } from '../../components/Skeleton'
import { useAllCourts } from '../scoring/hooks'
import { CourtGrid } from '../referee/CourtGrid'

import { useSport } from '../../auth/SportContext'
export function ScorekeeperHome() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const courts = useAllCourts()
  const [jumpId, setJumpId] = useState('')

  function handleJump(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = jumpId.trim()
    if (!trimmed) return
    navigate({
      to: '/$sport/scorekeeper/matches/$publicId',
      params: { sport: sportSlug, publicId: trimmed },
    })
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">
          Scorekeeper
        </h1>
        <form onSubmit={handleJump} className="flex items-center gap-2">
          <Input
            value={jumpId}
            onChange={(e) => setJumpId(e.target.value)}
            placeholder="Match public ID"
            aria-label="Match public ID"
            className="w-48"
          />
          <Button type="submit" variant="secondary" aria-label="Open match">
            <Search size={16} />
          </Button>
        </form>
      </div>

      <p className="text-sm text-(--color-text-secondary) mb-4">
        Lightweight scoring for casual matches. Tap a court to begin.
      </p>

      {courts.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : courts.isError ? (
        <div className="text-center py-8 text-(--color-text-secondary)">
          Could not load courts. Use the Match public ID input above to open a
          specific match.
        </div>
      ) : (
        <CourtGrid
          courts={courts.data ?? []}
          mode="scorekeeper"
          emptyMessage="No courts available. Use the Match public ID input above to open a specific match."
        />
      )}
    </div>
  )
}
