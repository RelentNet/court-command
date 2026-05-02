import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '../../auth/useAuth'
import { useGetTournament, useListDivisions } from './hooks'
import { TabLayout } from '../../components/TabLayout'
import { Skeleton } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { TournamentOverview } from './TournamentOverview'
import { TournamentSettings } from './TournamentSettings'
import { DivisionList } from './DivisionList'
import { RegistrationTable } from './RegistrationTable'
import { AnnouncementFeed } from './AnnouncementFeed'
import { TournamentCourts } from './TournamentCourts'
import { TournamentStaff } from './TournamentStaff'
import { ChevronLeft } from 'lucide-react'

interface TournamentDetailProps {
  tournamentId: string
}

export function TournamentDetail({ tournamentId }: TournamentDetailProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const { user } = useAuth()
  // TODO: replace with scoped authorization (Batch I) once that lands.
  const isAdmin =
    user?.role === 'platform_admin' || user?.role === 'tournament_director'
  const { data: tournament, isLoading, error } = useGetTournament(tournamentId)
  const { data: divisions } = useListDivisions(tournamentId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <EmptyState
        title="Failed to load tournament"
        description={(error as Error)?.message || 'Tournament not found.'}
        action={
          <Link to="/tournaments">
            <Button variant="secondary">Back to Tournaments</Button>
          </Link>
        }
      />
    )
  }

  const divisionCount = divisions?.length ?? 0

  const allTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'divisions', label: 'Divisions', count: divisionCount },
    { id: 'courts', label: 'Courts' },
    { id: 'registrations', label: 'Registrations', adminOnly: true },
    { id: 'announcements', label: 'Announcements', adminOnly: true },
    { id: 'staff', label: 'Staff', adminOnly: true },
    { id: 'settings', label: 'Settings', adminOnly: true },
  ]

  const tabs = allTabs.filter((t) => !t.adminOnly || isAdmin)

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/tournaments"
          className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Tournaments
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            {tournament.name}
          </h1>
          <StatusBadge status={tournament.status} type="tournament" />
        </div>
      </div>

      <TabLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'overview' && (
          <TournamentOverview
            tournament={tournament}
            divisions={divisions ?? []}
          />
        )}
        {activeTab === 'divisions' && (
          <DivisionList
            tournamentId={tournamentId}
            divisions={divisions ?? []}
          />
        )}
        {activeTab === 'courts' && (
          <TournamentCourts tournamentId={tournament.id} venueId={tournament.venue_id} />
        )}
        {isAdmin && activeTab === 'registrations' && (
          <RegistrationTable
            tournamentId={tournamentId}
            divisions={divisions ?? []}
          />
        )}
        {isAdmin && activeTab === 'announcements' && (
          <AnnouncementFeed tournamentId={tournamentId} />
        )}
        {isAdmin && activeTab === 'staff' && tournament && (
          <TournamentStaff tournamentId={tournament.id} />
        )}
        {isAdmin && activeTab === 'settings' && (
          <TournamentSettings
            tournament={tournament}
            tournamentId={tournamentId}
          />
        )}
      </TabLayout>
    </div>
  )
}
