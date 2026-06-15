import { useAuth } from '../../auth/useAuth'
import { useDashboard } from './hooks'
import { StatsSummary } from './StatsSummary'
import { UpcomingMatches } from './UpcomingMatches'
import { ActiveRegistrations } from './ActiveRegistrations'
import { RecentResults } from './RecentResults'
import { MyTeams } from './MyTeams'
import { DashboardAnnouncements } from './DashboardAnnouncements'
import { AdSlot } from '../../components/AdSlot'
import { Card } from '../../components/Card'
import { Skeleton } from '../../components/Skeleton'
import { usePageTitle } from '../../hooks/usePageTitle'
import { NewsWidget } from '../../components/NewsWidget'

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      {/* Two-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      {/* Full-width */}
      <Skeleton className="h-48" />
      {/* Two-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  )
}

export function PlayerDashboard() {
  usePageTitle('My Dashboard')
  const { user } = useAuth()
  const { data, isLoading, isError, error } = useDashboard()

  const displayName =
    user?.display_name || user?.first_name || 'Player'

  return (
    <div className="space-y-6">
      {/* Header. Smoke 2.5/4.1: bumped greeting from text-sm muted to
          text-lg secondary so it actually reads as a greeting and not
          a subtitle. The page title stays semantic h1. */}
      <div>
        <h1 className="text-3xl font-bold text-(--color-text-primary)">
          Welcome back, {displayName}
        </h1>
        <p className="text-base text-(--color-text-secondary) mt-1">
          Here's what's happening on your courts.
        </p>
      </div>

      {/* Ad */}
      <AdSlot size="responsive-banner" slot="dashboard-top" />

      {/* Loading */}
      {isLoading && <DashboardSkeleton />}

      {/* Error */}
      {isError && (
        <Card>
          <p className="text-sm text-red-500" role="alert">
            Failed to load dashboard{error instanceof Error ? `: ${error.message}` : '.'}
          </p>
        </Card>
      )}

      {/* Content */}
      {data && (
        <>
          {/* Stats row — full width */}
          <StatsSummary data={data.stats} />

          {/* Two-col: Upcoming + Registrations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3">
                Upcoming Matches
              </h2>
              <UpcomingMatches data={data.upcoming_matches} />
            </section>
            <section>
              <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3">
                Active Registrations
              </h2>
              <ActiveRegistrations data={data.active_registrations} />
            </section>
          </div>

          {/* Full-width: Recent Results */}
          <section>
            <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3">
              Recent Results
            </h2>
            <RecentResults data={data.recent_results} />
          </section>

          {/* Two-col: Teams + Announcements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3">
                My Teams
              </h2>
              <MyTeams data={data.teams} />
            </section>
            <section>
              <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3">
                Announcements
              </h2>
              <DashboardAnnouncements data={data.announcements} />
            </section>
          </div>

          {/* Two-col: News */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <NewsWidget
              title="Tournament News"
              tag="tournament-news"
              limit={3}
              viewAllUrl="https://news.courtcommand.app/tag/tournament-news"
            />
            <NewsWidget
              title="League Updates"
              tag="league-updates"
              limit={3}
              viewAllUrl="https://news.courtcommand.app/tag/league-updates"
            />
          </div>
        </>
      )}
    </div>
  )
}
