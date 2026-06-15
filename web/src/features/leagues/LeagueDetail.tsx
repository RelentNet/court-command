import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  useGetLeague,
  useListSeasons,
  useListDivisionTemplates,
  useListLeagueRegistrations,
} from './hooks'
import { TabLayout } from '../../components/TabLayout'
import { Skeleton } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { AdSlot } from '../../components/AdSlot'
import { LeagueOverview } from './LeagueOverview'
import { SeasonList } from './SeasonList'
import { DivisionTemplateList } from './DivisionTemplateList'
import { LeagueRegistrations } from './LeagueRegistrations'
import { LeagueAnnouncementFeed } from './LeagueAnnouncementFeed'
import { ChevronLeft } from 'lucide-react'

import { useSport } from '../../auth/SportContext'
interface Props {
  leagueId: string
}

export function LeagueDetail({ leagueId }: Props) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [activeTab, setActiveTab] = useState('overview')
  const leagueIdNum = Number(leagueId)
  const { data: league, isLoading, error } = useGetLeague(leagueIdNum)
  const { data: seasons } = useListSeasons(leagueIdNum)
  const { data: templates } = useListDivisionTemplates(leagueIdNum)
  const { data: regs } = useListLeagueRegistrations(leagueIdNum)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !league) {
    return (
      <EmptyState
        title="Failed to load league"
        description={(error as Error)?.message || 'League not found.'}
        action={
          <Link to="/$sport/leagues" params={{ sport: sportSlug }}>
            <Button variant="secondary">Back to Leagues</Button>
          </Link>
        }
      />
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'seasons', label: 'Seasons', count: seasons?.length },
    { id: 'templates', label: 'Division Templates', count: templates?.length },
    { id: 'registrations', label: 'Registrations', count: regs?.length },
    { id: 'announcements', label: 'Announcements' },
  ]

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/$sport/leagues" params={{ sport: sportSlug }}
          className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Leagues
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            {league.name}
          </h1>
          <StatusBadge status={league.status} type="league" />
        </div>
      </div>

      <AdSlot size="responsive-banner" slot="league-detail-top" className="mb-4" />

      <TabLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'overview' && <LeagueOverview league={league} />}
        {activeTab === 'seasons' && <SeasonList leagueId={league.id} />}
        {activeTab === 'templates' && <DivisionTemplateList leagueId={league.id} />}
        {activeTab === 'registrations' && (
          <LeagueRegistrations leagueId={league.id} />
        )}
        {activeTab === 'announcements' && (
          <LeagueAnnouncementFeed leagueId={league.id} />
        )}
      </TabLayout>
    </div>
  )
}
