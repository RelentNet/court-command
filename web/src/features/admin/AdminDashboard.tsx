import {
  Users,
  Swords,
  Trophy,
  Medal,
  MapPin,
  AlertCircle,
  LayoutGrid,
  Zap,
  Megaphone,
  Upload,
  Key,
  ScrollText,
  Settings,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Card } from '../../components/Card'
import { Skeleton } from '../../components/Skeleton'
import { useAdminStats } from './hooks'
import type { AdminStats } from './types'

import { useSport } from '../../auth/SportContext'
interface StatCardProps {
  label: string
  value: number
  icon: typeof Users
  highlight?: boolean
  to?: string
}

function StatCard({ label, value, icon: Icon, highlight, to }: StatCardProps) {
  const content = (
    <Card
      className={[
        highlight ? 'border-amber-500/50 bg-amber-500/5' : '',
        to ? 'cursor-pointer hover:border-(--color-accent) transition-colors' : '',
      ].filter(Boolean).join(' ') || undefined}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--color-bg-primary)">
          <Icon className="h-5 w-5 text-(--color-text-muted)" />
        </div>
        <div>
          <p className="text-sm text-(--color-text-muted)">{label}</p>
          <p className="text-2xl font-semibold text-(--color-text-primary)">
            {value >= 0 ? value.toLocaleString() : 'Manage'}
          </p>
        </div>
      </div>
    </Card>
  )

  if (to) {
    return (
      <Link to={to as never} className="block">
        {content}
      </Link>
    )
  }

  return content
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  )
}

function getStatCards(stats: AdminStats, sportSlug: string) {
  return [
    { label: 'Total Users', value: stats.total_users, icon: Users, to: '/$sport/admin/users', params: { sport: sportSlug } },
    { label: 'Total Matches', value: stats.total_matches, icon: Swords, to: '/$sport/ref', params: { sport: sportSlug } },
    { label: 'Active Tournaments', value: stats.total_tournaments, icon: Trophy, to: '/$sport/tournaments', params: { sport: sportSlug } },
    { label: 'Total Leagues', value: stats.total_leagues, icon: Medal, to: '/$sport/leagues', params: { sport: sportSlug } },
    { label: 'Total Venues', value: stats.total_venues, icon: MapPin, to: '/$sport/venues', params: { sport: sportSlug } },
    {
      label: 'Pending Venues',
      value: stats.pending_venues,
      icon: AlertCircle,
      highlight: stats.pending_venues > 0,
      to: '/$sport/admin/venues', params: { sport: sportSlug },
    },
    { label: 'Total Courts', value: stats.total_courts, icon: LayoutGrid, to: '/$sport/courts', params: { sport: sportSlug } },
    { label: 'Active Matches', value: stats.active_matches, icon: Zap, to: '/$sport/ref', params: { sport: sportSlug } },
    { label: 'Ad Manager', value: -1, icon: Megaphone, to: '/$sport/admin/ads', params: { sport: sportSlug } },
    { label: 'Uploads', value: -1, icon: Upload, to: '/$sport/admin/uploads', params: { sport: sportSlug } },
    { label: 'API Keys', value: -1, icon: Key, to: '/$sport/admin/api-keys', params: { sport: sportSlug } },
    { label: 'Activity Log', value: -1, icon: ScrollText, to: '/$sport/admin/activity', params: { sport: sportSlug } },
    { label: 'Settings', value: -1, icon: Settings, to: '/$sport/admin/settings', params: { sport: sportSlug } },
  ]
}

export function AdminDashboard() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''
  const { data: stats, isLoading, error, refetch } = useAdminStats()

  if (isLoading) return <LoadingSkeleton />

  if (error || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">
          Admin Dashboard
        </h1>
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <AlertCircle className="h-8 w-8 text-(--color-error)" />
            <p className="text-(--color-text-secondary)">
              Failed to load admin stats
            </p>
            <button
              onClick={() => refetch()}
              className="text-sm font-medium text-(--color-accent) hover:underline"
            >
              Retry
            </button>
          </div>
        </Card>
      </div>
    )
  }

  const cards = getStatCards(stats, sportSlug)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-(--color-text-primary)">
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  )
}
