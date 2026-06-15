import { Link } from '@tanstack/react-router'
import { Trophy, Medal, MapPin, Building2, Plus } from 'lucide-react'
import { useMyVenues, useMyTournaments, useMyLeagues, useMyOrgs } from './hooks'
import { Card } from '../../components/Card'
import { Badge } from '../../components/Badge'
import { Skeleton } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'

import { useSport } from '../../auth/SportContext'
export function ManageHub() {
  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-(--color-text-primary)">My Assets</h1>
        <p className="mt-1 text-(--color-text-secondary)">
          Venues, tournaments, leagues, and organizations you manage.
        </p>
      </div>

      <VenuesSection />
      <TournamentsSection />
      <LeaguesSection />
      <OrgsSection />
    </div>
  )
}

// ---- Venues ----

function VenuesSection() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data: venues, isLoading, isError } = useMyVenues()

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-(--color-text-primary) flex items-center gap-2">
          <MapPin size={20} />
          My Venues
        </h2>
        <Link to="/$sport/venues" params={{ sport: sportSlug }} className="text-sm text-(--color-text-accent) hover:underline">
          View All Venues
        </Link>
      </div>

      {isLoading && <LoadingCards />}
      {isError && <p className="text-sm text-red-500">Failed to load venues</p>}
      {venues && venues.length === 0 && (
        <EmptyState
          title="No venues"
          description="Create a venue to manage courts and host events."
        />
      )}
      {venues && venues.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {venues.map((v) => (
            <Link key={v.id} to="/$sport/venues/$venueId" params={{ sport: sportSlug, venueId: String(v.id) }}>
              <Card className="hover:border-(--color-text-accent) transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-(--color-text-primary)">{v.name}</h3>
                    {(v.city || v.state_province) && (
                      <p className="text-sm text-(--color-text-secondary) mt-0.5">
                        {[v.city, v.state_province].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={v.status} type="venue" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ---- Tournaments ----

function TournamentsSection() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''
  const { data, isLoading, isError } = useMyTournaments()
  const tournaments = data?.items ?? []

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-(--color-text-primary) flex items-center gap-2">
          <Trophy size={20} />
          My Tournaments
        </h2>
        <Link to="/$sport/tournaments/create" params={{ sport: sportSlug }} className="inline-flex items-center gap-1 text-sm text-(--color-text-accent) hover:underline">
          <Plus size={14} /> Create Tournament
        </Link>
      </div>

      {isLoading && <LoadingCards />}
      {isError && <p className="text-sm text-red-500">Failed to load tournaments</p>}
      {!isLoading && tournaments.length === 0 && (
        <EmptyState
          title="No tournaments"
          description="Create your first tournament to get started."
        />
      )}
      {tournaments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map((t) => (
            <Link key={t.id} to="/$sport/tournaments/$tournamentId" params={{ sport: sportSlug, tournamentId: String(t.id) }}>
              <Card className="hover:border-(--color-text-accent) transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-(--color-text-primary)">{t.name}</h3>
                    {t.start_date && (
                      <p className="text-sm text-(--color-text-secondary) mt-0.5">
                        {new Date(t.start_date).toLocaleDateString()}
                        {t.end_date && ` – ${new Date(t.end_date).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={t.status} type="tournament" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ---- Leagues ----

function LeaguesSection() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''
  const { data, isLoading, isError } = useMyLeagues()
  const leagues = data?.items ?? []

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-(--color-text-primary) flex items-center gap-2">
          <Medal size={20} />
          My Leagues
        </h2>
        <Link to="/$sport/leagues/create" params={{ sport: sportSlug }} className="inline-flex items-center gap-1 text-sm text-(--color-text-accent) hover:underline">
          <Plus size={14} /> Create League
        </Link>
      </div>

      {isLoading && <LoadingCards />}
      {isError && <p className="text-sm text-red-500">Failed to load leagues</p>}
      {!isLoading && leagues.length === 0 && (
        <EmptyState
          title="No leagues"
          description="Create a league to organize seasons and tournaments."
        />
      )}
      {leagues.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map((l) => (
            <Link key={l.id} to="/$sport/leagues/$leagueId" params={{ sport: sportSlug, leagueId: String(l.id) }}>
              <Card className="hover:border-(--color-text-accent) transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-(--color-text-primary)">{l.name}</h3>
                    {(l.city || l.state_province) && (
                      <p className="text-sm text-(--color-text-secondary) mt-0.5">
                        {[l.city, l.state_province].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={l.status} type="league" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ---- Organizations ----

function OrgsSection() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''
  const { data: orgs, isLoading, isError } = useMyOrgs()

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-(--color-text-primary) flex items-center gap-2">
          <Building2 size={20} />
          My Organizations
        </h2>
        <Link to="/$sport/organizations" params={{ sport: sportSlug }} className="text-sm text-(--color-text-accent) hover:underline">
          View All Orgs
        </Link>
      </div>

      {isLoading && <LoadingCards />}
      {isError && <p className="text-sm text-red-500">Failed to load organizations</p>}
      {orgs && orgs.length === 0 && (
        <EmptyState
          title="No organizations"
          description="Join or create an organization to manage teams."
        />
      )}
      {orgs && orgs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map((o) => (
            <Link key={o.id} to="/$sport/organizations/$orgId" params={{ sport: sportSlug, orgId: String(o.id) }}>
              <Card className="hover:border-(--color-text-accent) transition-colors cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-(--color-text-primary)">{o.name}</h3>
                    {(o.city || o.state_province) && (
                      <p className="text-sm text-(--color-text-secondary) mt-0.5">
                        {[o.city, o.state_province].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <Badge variant="info">{o.membership_role}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ---- Shared ----

function LoadingCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </Card>
      ))}
    </div>
  )
}
