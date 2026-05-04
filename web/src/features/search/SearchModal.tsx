import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, X, Users, UsersRound, Building2, Trophy, Medal, MapPin } from 'lucide-react'
import { useGlobalSearch } from './hooks'
import { SearchResultGroup, type SearchResultItem } from './SearchResultGroup'
import { useSport } from '../../auth/SportContext'
import type {
  SearchPlayerResult,
  SearchTeamResult,
  SearchOrganizationResult,
  SearchTournamentResult,
  SearchLeagueResult,
  SearchVenueResult,
} from './hooks'

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mappers: convert wire types to SearchResultItem
//
// Routes after Phase 3 restructure:
//   - Tournaments / Leagues / Venues have public detail pages at
//     /public/<entity>/<slug> -- always linkable, no auth required.
//   - Players / Teams / Organizations only have auth-protected detail
//     pages at /<sport>/<entity>/<id-or-slug>. When no sport is active
//     (anonymous on /, /public/*, /overlay, etc.) we skip these entities
//     entirely to avoid producing a Link whose `to` doesn't match any
//     registered route -- which crashes useLinkProps with "Cannot read
//     properties of null (reading 'isServer')" and blanks the page.
// ---------------------------------------------------------------------------

function mapPlayers(items: SearchPlayerResult[], sportSlug: string): SearchResultItem[] {
  if (!sportSlug) return []
  return items
    .filter((p) => !p.is_profile_hidden)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      label: p.display_name || `${p.first_name} ${p.last_name}`,
      subtitle: [p.city, p.state_province].filter(Boolean).join(', ') || undefined,
      link: `/${sportSlug}/players/${p.public_id}`,
    }))
}

function mapTeams(items: SearchTeamResult[], sportSlug: string): SearchResultItem[] {
  if (!sportSlug) return []
  return items.slice(0, 3).map((t) => ({
    id: t.id,
    label: t.name,
    subtitle: t.short_name !== t.name ? t.short_name : undefined,
    link: `/${sportSlug}/teams/${t.slug}`,
  }))
}

function mapOrganizations(items: SearchOrganizationResult[], sportSlug: string): SearchResultItem[] {
  if (!sportSlug) return []
  return items.slice(0, 3).map((o) => ({
    id: o.id,
    label: o.name,
    subtitle: [o.city, o.state_province].filter(Boolean).join(', ') || undefined,
    link: `/${sportSlug}/organizations/${o.slug}`,
  }))
}

function mapTournaments(items: SearchTournamentResult[]): SearchResultItem[] {
  return items.slice(0, 3).map((t) => ({
    id: t.id,
    label: t.name,
    subtitle: t.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    link: `/public/tournaments/${t.slug}`,
  }))
}

function mapLeagues(items: SearchLeagueResult[]): SearchResultItem[] {
  return items.slice(0, 3).map((l) => ({
    id: l.id,
    label: l.name,
    subtitle: [l.city, l.state_province].filter(Boolean).join(', ') || undefined,
    link: `/public/leagues/${l.slug}`,
  }))
}

function mapVenues(items: SearchVenueResult[]): SearchResultItem[] {
  return items.slice(0, 3).map((v) => ({
    id: v.id,
    label: v.name,
    subtitle: [v.city, v.state_province].filter(Boolean).join(', ') || undefined,
    link: `/public/venues/${v.slug}`,
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: results, isLoading } = useGlobalSearch(query)
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      // Small delay to let dialog paint
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const handleNavigate = useCallback(() => {
    setQuery('')
    onClose()
  }, [onClose])

  if (!open) return null

  const groups = results
    ? [
        { title: 'Players', icon: <Users className="h-4 w-4" />, items: mapPlayers(results.players, sportSlug) },
        { title: 'Teams', icon: <UsersRound className="h-4 w-4" />, items: mapTeams(results.teams, sportSlug) },
        { title: 'Organizations', icon: <Building2 className="h-4 w-4" />, items: mapOrganizations(results.organizations, sportSlug) },
        { title: 'Tournaments', icon: <Trophy className="h-4 w-4" />, items: mapTournaments(results.tournaments) },
        { title: 'Leagues', icon: <Medal className="h-4 w-4" />, items: mapLeagues(results.leagues) },
        { title: 'Venues', icon: <MapPin className="h-4 w-4" />, items: mapVenues(results.venues) },
      ]
    : []

  const hasResults = groups.some((g) => g.items.length > 0)
  const trimmedQuery = query.trim()

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="fixed inset-x-0 top-[15vh] z-50 mx-auto w-full max-w-lg rounded-xl border border-(--color-border) bg-(--color-bg-primary) shadow-2xl overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-(--color-border) px-4 py-3">
          <Search className="h-5 w-5 text-(--color-text-secondary) shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players, teams, tournaments..."
            aria-label="Search players, teams, tournaments"
            className="flex-1 bg-transparent text-sm text-(--color-text-primary) placeholder:text-(--color-text-secondary) focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-(--color-text-secondary) hover:bg-(--color-bg-hover)"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-(--color-border) px-1.5 py-0.5 text-[10px] font-medium text-(--color-text-secondary)">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {trimmedQuery.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-(--color-text-secondary)">
              Type at least 2 characters to search
            </p>
          )}

          {trimmedQuery.length >= 2 && isLoading && (
            <p className="px-3 py-8 text-center text-sm text-(--color-text-secondary)">
              Searching...
            </p>
          )}

          {trimmedQuery.length >= 2 && !isLoading && !hasResults && (
            <p className="px-3 py-8 text-center text-sm text-(--color-text-secondary)">
              No results found for &ldquo;{trimmedQuery}&rdquo;
            </p>
          )}

          {hasResults && (
            <div className="space-y-2">
              {groups.map((group) => (
                <SearchResultGroup
                  key={group.title}
                  title={group.title}
                  icon={group.icon}
                  items={group.items}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
