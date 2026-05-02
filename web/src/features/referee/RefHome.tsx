// web/src/features/referee/RefHome.tsx
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Search, MapPin } from 'lucide-react'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Skeleton } from '../../components/Skeleton'
import { useAuth } from '../../auth/useAuth'
import {
  useAllCourts,
  useCourtsForTournament,
  useMyTournamentAssignment,
} from '../scoring/hooks'
import type { CourtSummary } from '../scoring/types'
import { CourtGrid } from './CourtGrid'

import { useSport } from '../../auth/SportContext'
function groupCourtsByVenue(courts: CourtSummary[]) {
  const map = new Map<string, CourtSummary[]>()

  for (const c of courts) {
    const key = c.venue_name ?? '__floating__'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(c)
  }

  // Named venues first (sorted), then floating courts last
  const sortedKeys = [...map.keys()].sort((a, b) => {
    if (a === '__floating__') return 1
    if (b === '__floating__') return -1
    return a.localeCompare(b)
  })

  return sortedKeys.map((key) => ({
    venueName: key === '__floating__' ? 'Floating Courts' : key,
    courts: map.get(key)!,
  }))
}

export function RefHome() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { user } = useAuth()
  const isStaff = user?.role === 'referee' || user?.role === 'scorekeeper'

  const courts = useAllCourts()
  const assignment = useMyTournamentAssignment()
  const tournamentCourts = useCourtsForTournament(
    isStaff ? assignment.data?.tournament_id : undefined,
  )

  const activeCourts = isStaff && assignment.data ? tournamentCourts : courts

  const [jumpId, setJumpId] = useState('')

  const venueGroups = useMemo(
    () => groupCourtsByVenue(activeCourts.data ?? []),
    [activeCourts.data],
  )

  function handleJump(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = jumpId.trim()
    if (!trimmed) return
    navigate({
      to: '/$sport/ref/matches/$publicId',
      params: { sport: sportSlug, publicId: trimmed },
    })
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">
          Referee Console{assignment.data ? ` — ${assignment.data.tournament_name}` : ''}
        </h1>
        <form
          onSubmit={handleJump}
          className="flex items-center gap-2"
        >
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
        Tap a court to view its matches. Active matches show a live score.
      </p>

      {activeCourts.isLoading || (isStaff && assignment.isLoading) ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : activeCourts.isError ? (
        <div className="text-center py-8 text-(--color-text-secondary)">
          Could not load courts. Use the Match public ID input above to open a
          specific match.
        </div>
      ) : venueGroups.length === 0 ? (
        <div className="text-center py-8 text-(--color-text-secondary)">
          No courts available. Use the Match public ID input above to open a specific match.
        </div>
      ) : venueGroups.length === 1 ? (
        /* Single venue — no grouping headers needed */
        <CourtGrid
          courts={venueGroups[0].courts}
          mode="ref"
          emptyMessage="No courts available."
        />
      ) : (
        /* Multiple venues — group with section headers */
        <div className="space-y-6">
          {venueGroups.map((group) => (
            <section key={group.venueName}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wider mb-3">
                <MapPin className="h-3.5 w-3.5" />
                {group.venueName}
                <span className="text-xs font-normal">({group.courts.length})</span>
              </h2>
              <CourtGrid
                courts={group.courts}
                mode="ref"
                emptyMessage="No courts at this venue."
              />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
