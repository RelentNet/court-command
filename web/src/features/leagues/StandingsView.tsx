import { useMemo, useState } from 'react'
import { useListStandingsBySeason, useRecomputeStandings } from './hooks'
import type { StandingsEntry } from './hooks'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { Skeleton } from '../../components/Skeleton'
import { Badge } from '../../components/Badge'
import { Button } from '../../components/Button'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../auth/useAuth'
import { BarChart3, RefreshCw } from 'lucide-react'

interface Props {
  seasonId: number
  /** Map of division ID -> name for display. When not provided, falls back to "Division #ID". */
  divisionNames?: Record<number, string>
}

interface GroupedDivision {
  divisionId: number
  name: string
  entries: StandingsEntry[]
}

export function StandingsView({ seasonId, divisionNames }: Props) {
  const { data: entries, isLoading, error } = useListStandingsBySeason(seasonId)
  const { user } = useAuth()
  const isAdmin = user?.role === 'platform_admin'

  const grouped = useMemo<GroupedDivision[]>(() => {
    if (!entries || entries.length === 0) return []

    const map = new Map<number, StandingsEntry[]>()
    for (const e of entries) {
      const arr = map.get(e.division_id) || []
      arr.push(e)
      map.set(e.division_id, arr)
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([divisionId, divEntries]) => ({
        divisionId,
        name: divisionNames?.[divisionId] ?? `Division #${divisionId}`,
        entries: divEntries.sort((a, b) => a.rank - b.rank),
      }))
  }, [entries, divisionNames])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load standings"
        description={(error as Error)?.message || 'An error occurred.'}
      />
    )
  }

  if (grouped.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-12 w-12" />}
        title="No standings yet"
        description="Standings will appear here once matches are completed and standings are computed."
      />
    )
  }

  return (
    <div className="space-y-6">
      {grouped.map((div) => (
        <DivisionStandings
          key={div.divisionId}
          seasonId={seasonId}
          division={div}
          isAdmin={isAdmin}
        />
      ))}
    </div>
  )
}

function DivisionStandings({
  seasonId,
  division,
  isAdmin,
}: {
  seasonId: number
  division: GroupedDivision
  isAdmin: boolean
}) {
  const { toast } = useToast()
  const recompute = useRecomputeStandings(seasonId, division.divisionId)
  const [recomputing, setRecomputing] = useState(false)

  async function handleRecompute() {
    setRecomputing(true)
    try {
      await recompute.mutateAsync()
      toast('success', `Standings recomputed for ${division.name}`)
    } catch (err) {
      toast('error', (err as Error).message || 'Failed to recompute')
    } finally {
      setRecomputing(false)
    }
  }

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-(--color-text-primary)">
            {division.name}
          </h3>
          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRecompute}
              disabled={recomputing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${recomputing ? 'animate-spin' : ''}`}
              />
              {recomputing ? 'Recomputing...' : 'Recompute'}
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-(--color-text-secondary)">
                <th className="py-2 px-3 text-left font-medium w-12">#</th>
                <th className="py-2 px-3 text-left font-medium">Team</th>
                <th className="py-2 px-3 text-center font-medium">W</th>
                <th className="py-2 px-3 text-center font-medium">L</th>
                <th className="py-2 px-3 text-center font-medium">D</th>
                <th className="py-2 px-3 text-center font-medium">MP</th>
                <th className="py-2 px-3 text-center font-medium">PF</th>
                <th className="py-2 px-3 text-center font-medium">PA</th>
                <th className="py-2 px-3 text-center font-medium">+/-</th>
                <th className="py-2 px-3 text-center font-medium">Pts</th>
              </tr>
            </thead>
            <tbody>
              {division.entries.map((entry) => (
                <StandingsRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

function StandingsRow({ entry }: { entry: StandingsEntry }) {
  const hasOverride =
    entry.override_points !== undefined && entry.override_points !== null

  return (
    <tr
      className={`border-b border-(--color-border) last:border-b-0 ${
        entry.is_withdrawn ? 'opacity-50' : ''
      }`}
    >
      <td className="py-2 px-3 text-(--color-text-secondary) font-medium">
        {entry.rank}
      </td>
      <td className="py-2 px-3 text-(--color-text-primary) font-medium">
        <span className="flex items-center gap-2">
          Team #{entry.team_id}
          {entry.is_withdrawn && (
            <Badge variant="error">Withdrawn</Badge>
          )}
          {hasOverride && (
            <Badge variant="warning">
              Override: {entry.override_points}
            </Badge>
          )}
        </span>
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-primary)">
        {entry.wins}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-primary)">
        {entry.losses}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-primary)">
        {entry.draws}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-secondary)">
        {entry.matches_played}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-secondary)">
        {entry.points_for}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-secondary)">
        {entry.points_against}
      </td>
      <td
        className={`py-2 px-3 text-center font-medium ${
          entry.point_differential > 0
            ? 'text-emerald-500'
            : entry.point_differential < 0
              ? 'text-red-500'
              : 'text-(--color-text-secondary)'
        }`}
      >
        {entry.point_differential > 0 ? '+' : ''}
        {entry.point_differential}
      </td>
      <td className="py-2 px-3 text-center font-bold text-(--color-text-primary)">
        {entry.standing_points}
      </td>
    </tr>
  )
}
