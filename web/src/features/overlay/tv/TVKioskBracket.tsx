// web/src/features/overlay/tv/TVKioskBracket.tsx
//
// Full-screen kiosk view for a tournament. Rotates through a set of slides
// every N seconds (default 20s, overridable via ?cycle=N query).
//
// Slides generated from available data:
//   1) Tournament overview (title + stats)
//   2) One slide per division: bracket or pool-play matches
//   3) Courts-in-play snapshot (active/on-deck summary)
//
// Watermark pinned bottom-right. No sidebar (route is in NO_SHELL_PATTERNS).

import { useEffect, useMemo } from 'react'
import { AlertTriangle, Calendar, Trophy, Tv } from 'lucide-react'
import {
  useGetTournament,
  useListDivisions,
  useListBracketMatches,
  type Division,
} from '../../tournaments/hooks'
import { useCourtsForTournament } from '../../scoring/hooks'
import type { CourtSummary, Match } from '../../scoring/types'
import { OverlayWatermark } from '../OverlayWatermark'
import { useSlideRotation } from './useSlideRotation'

export interface TVKioskBracketProps {
  tournamentID: string
  cycleSeconds?: number
}

export function TVKioskBracket({
  tournamentID,
  cycleSeconds = 20,
}: TVKioskBracketProps) {
  const tournamentQuery = useGetTournament(tournamentID)
  const divisionsQuery = useListDivisions(tournamentID)
  const tournamentIdNum = Number(tournamentID)
  const courts = useCourtsForTournament(
    Number.isFinite(tournamentIdNum) ? tournamentIdNum : undefined,
  )

  const tournament = tournamentQuery.data
  const divisions = divisionsQuery.data ?? []
  const courtList = courts.data ?? []

  // Slide structure:
  //   0: tournament hero
  //   1..N: division (bracket or pool)
  //   N+1: courts in play (only if courts are present)
  const slides = useMemo(() => {
    const list: TVSlide[] = []
    list.push({ kind: 'hero' })
    for (const d of divisions) {
      list.push({ kind: 'division', division: d })
    }
    if (courtList.length > 0) {
      list.push({ kind: 'courts' })
    }
    return list
  }, [divisions, courtList.length])

  const { index } = useSlideRotation({
    count: slides.length,
    intervalMs: cycleSeconds * 1_000,
  })

  // Force body to be fully sized for kiosk mode AND force dark theme.
  // Smoke 14.2: TV/kiosk displays are typically dark venues (broadcast
  // truck, scorer's table, courtside TVs); white backgrounds blow out
  // viewers' eyes and are visible from the bleachers. Force dark
  // regardless of the operator's system preference. Restored on
  // unmount so navigating away doesn't re-theme the SPA.
  useEffect(() => {
    const html = document.documentElement
    const wasDark = html.classList.contains('dark')
    html.classList.add('dark')
    const prevBg = document.body.style.background
    const prevOverflow = document.body.style.overflow
    document.body.style.background = 'var(--color-bg-primary, #000)'
    document.body.style.overflow = 'hidden'
    return () => {
      if (!wasDark) html.classList.remove('dark')
      document.body.style.background = prevBg
      document.body.style.overflow = prevOverflow
    }
  }, [])

  if (tournamentQuery.isLoading || divisionsQuery.isLoading) {
    return <FullScreenMessage icon={Tv} title="Loading tournament…" />
  }

  if (tournamentQuery.isError || !tournament) {
    return (
      <FullScreenMessage
        icon={AlertTriangle}
        title="Tournament not available"
        subtitle={
          (tournamentQuery.error as Error | undefined)?.message ??
          'Unable to load tournament data.'
        }
      />
    )
  }

  const active = slides[index] ?? slides[0]
  return (
    <div className="fixed inset-0 flex flex-col bg-(--color-bg-primary) text-(--color-text-primary)">
      <TVHeader tournament={tournament} slideIndex={index} total={slides.length} />
      <div className="flex-1 overflow-hidden">
        {active?.kind === 'hero' && (
          <HeroSlide
            tournament={tournament}
            divisionsCount={divisions.length}
            courtsCount={courtList.length}
          />
        )}
        {active?.kind === 'division' && (
          <DivisionSlide division={active.division} />
        )}
        {active?.kind === 'courts' && <CourtsSlide courts={courtList} />}
      </div>
      <OverlayWatermark />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slide kinds
// ---------------------------------------------------------------------------

type TVSlide =
  | { kind: 'hero' }
  | { kind: 'division'; division: Division }
  | { kind: 'courts' }

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function TVHeader({
  tournament,
  slideIndex,
  total,
}: {
  tournament: { name: string; start_date: string; end_date: string }
  slideIndex: number
  total: number
}) {
  return (
    <header className="flex items-center justify-between px-10 py-6 border-b border-(--color-border) bg-(--color-bg-secondary)">
      <div>
        <div className="text-sm uppercase tracking-widest text-(--color-text-secondary)">
          Tournament Kiosk
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-(--color-text-primary) mt-1">
          {tournament.name}
        </h1>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-(--color-text-secondary)">
            {formatDateRange(tournament.start_date, tournament.end_date)}
          </div>
          <div className="text-xs text-(--color-text-muted) mt-1">
            Slide {slideIndex + 1} of {total}
          </div>
        </div>
        <SlideProgress index={slideIndex} total={total} />
      </div>
    </header>
  )
}

function SlideProgress({ index, total }: { index: number; total: number }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2 w-6 rounded-full transition-colors ${
            i === index
              ? 'bg-(--color-accent)'
              : 'bg-(--color-bg-tertiary)'
          }`}
          aria-current={i === index ? 'true' : undefined}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero slide
// ---------------------------------------------------------------------------

function HeroSlide({
  tournament,
  divisionsCount,
  courtsCount,
}: {
  tournament: {
    name: string
    description: string | null
    logo_url: string | null
    banner_url: string | null
  }
  divisionsCount: number
  courtsCount: number
}) {
  return (
    <section
      className="h-full flex flex-col items-center justify-center px-10 relative"
      style={{
        backgroundImage: tournament.banner_url
          ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.75)), url(${tournament.banner_url})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {tournament.logo_url ? (
        <img
          src={tournament.logo_url}
          alt={`${tournament.name} logo`}
          className="h-28 md:h-40 mb-8 object-contain"
        />
      ) : (
        <Trophy className="h-28 md:h-40 mb-8 text-(--color-accent)" />
      )}
      <h2 className="text-5xl md:text-7xl font-bold text-white drop-shadow text-center">
        {tournament.name}
      </h2>
      {tournament.description ? (
        <p className="mt-6 max-w-4xl text-xl md:text-2xl text-center text-white/80 line-clamp-3">
          {tournament.description}
        </p>
      ) : null}
      <div className="mt-12 grid grid-cols-2 gap-10 text-center">
        <StatCell label="Divisions" value={divisionsCount} />
        <StatCell label="Courts in play" value={courtsCount} />
      </div>
    </section>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-6xl md:text-7xl font-bold text-(--color-accent)">
        {value}
      </div>
      <div className="mt-2 text-sm md:text-base uppercase tracking-widest text-white/80">
        {label}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Division slide
// ---------------------------------------------------------------------------

function DivisionSlide({ division }: { division: Division }) {
  const matchesQuery = useListBracketMatches(String(division.id))
  const matches = matchesQuery.data ?? []
  const isPool =
    division.bracket_format === 'round_robin' ||
    division.bracket_format === 'pool_play'

  return (
    <section className="h-full flex flex-col px-10 py-6">
      <div className="mb-4">
        <div className="text-sm uppercase tracking-widest text-(--color-text-secondary)">
          {formatBracketFormat(division.bracket_format)}
          {division.format ? ` · ${division.format}` : ''}
        </div>
        <h2 className="text-3xl md:text-5xl font-bold text-(--color-text-primary) mt-1">
          {division.name}
        </h2>
      </div>
      {matchesQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center text-(--color-text-muted)">
          Loading bracket…
        </div>
      ) : matches.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-(--color-text-muted)">
          Bracket not generated yet
        </div>
      ) : isPool ? (
        <PoolMatchesGrid matches={matches} />
      ) : (
        <BracketColumns matches={matches} />
      )}
    </section>
  )
}

// Backend MatchResponse uses underscored field names (team_1_id, team_1_score).
// Accept both conventions defensively.
interface KioskBracketMatch {
  id: number
  round?: number
  round_name?: string | null
  match_number?: number
  position?: number
  // API field names (correct)
  team_1_id?: number | null
  team_2_id?: number | null
  team_1_seed?: number | null
  team_2_seed?: number | null
  team_1_score?: number | null
  team_2_score?: number | null
  team_1?: { id: number; name: string; short_name?: string } | null
  team_2?: { id: number; name: string; short_name?: string } | null
  // Legacy fallback field names
  team1_id?: number | null
  team2_id?: number | null
  team_a_id?: number | null
  team_b_id?: number | null
  team1_seed?: number | null
  team2_seed?: number | null
  score_team1?: number | null
  score_team2?: number | null
  winner_team_id?: number | null
  winner_id?: number | null
  status?: string
}

function PoolMatchesGrid({ matches }: { matches: unknown[] }) {
  const rows = matches as KioskBracketMatch[]
  return (
    <div className="flex-1 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-6">
      {rows.map((m) => (
        <KioskMatchCard key={m.id} match={m} />
      ))}
    </div>
  )
}

function BracketColumns({ matches }: { matches: unknown[] }) {
  const rows = matches as KioskBracketMatch[]
  const byRound: Record<number, KioskBracketMatch[]> = {}
  for (const m of rows) {
    const r = m.round ?? 0
    if (!byRound[r]) byRound[r] = []
    byRound[r].push(m)
  }
  const rounds = Object.keys(byRound)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="flex gap-8 min-w-max pb-6">
        {rounds.map((r) => (
          <div key={r} className="flex flex-col gap-4 min-w-[260px]">
            <h3 className="text-sm uppercase tracking-widest text-(--color-text-secondary)">
              Round {r}
            </h3>
            <div className="flex flex-col gap-3">
              {byRound[r]
                .sort(
                  (a, b) =>
                    (a.match_number ?? a.position ?? 0) -
                    (b.match_number ?? b.position ?? 0),
                )
                .map((m) => (
                  <KioskMatchCard key={m.id} match={m} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KioskMatchCard({ match }: { match: KioskBracketMatch }) {
  const team1ID = match.team_1_id ?? match.team1_id ?? match.team_a_id ?? null
  const team2ID = match.team_2_id ?? match.team2_id ?? match.team_b_id ?? null
  const winnerID = match.winner_team_id ?? match.winner_id ?? null
  const score1 = match.team_1_score ?? match.score_team1
  const score2 = match.team_2_score ?? match.score_team2

  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) px-4 py-3">
      <div className="text-xs text-(--color-text-muted) mb-2 flex items-center justify-between">
        <span>
          R{match.round ?? 0} · M{match.match_number ?? match.position ?? 0}
        </span>
        <span className="uppercase tracking-wider">
          {match.status ?? 'scheduled'}
        </span>
      </div>
      <TeamLine
        label={formatTeamWithName(team1ID, match.team_1 ?? match.team_1, match.team_1_seed ?? match.team1_seed)}
        score={score1 ?? null}
        winner={winnerID != null && winnerID === team1ID}
      />
      <div className="my-1 border-t border-(--color-border)" />
      <TeamLine
        label={formatTeamWithName(team2ID, match.team_2 ?? match.team_2, match.team_2_seed ?? match.team2_seed)}
        score={score2 ?? null}
        winner={winnerID != null && winnerID === team2ID}
      />
    </div>
  )
}

function TeamLine({
  label,
  score,
  winner,
}: {
  label: string
  score: number | null
  winner: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between text-base ${
        winner
          ? 'font-semibold text-(--color-text-primary)'
          : 'text-(--color-text-secondary)'
      }`}
    >
      <span className="truncate pr-2">{label}</span>
      <span className="tabular-nums">{score ?? '—'}</span>
    </div>
  )
}

function formatTeamWithName(
  id: number | null,
  team?: { name: string; short_name?: string } | null,
  seed?: number | null,
): string {
  if (id == null && !team) return 'TBD'
  const seedPart = seed != null ? `(${seed}) ` : ''
  if (team?.short_name) return `${seedPart}${team.short_name}`
  if (team?.name) return `${seedPart}${team.name}`
  if (id != null) return `${seedPart}Team #${id}`
  return 'TBD'
}

// ---------------------------------------------------------------------------
// Courts-in-play slide
// ---------------------------------------------------------------------------

function CourtsSlide({ courts }: { courts: CourtSummary[] }) {
  const active = courts.filter((c) => c.active_match)
  const onDeck = courts.filter((c) => !c.active_match && c.on_deck_match)
  const sorted = [...active, ...onDeck, ...courts.filter((c) => !c.active_match && !c.on_deck_match)]
  return (
    <section className="h-full flex flex-col px-10 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Calendar className="h-8 w-8 text-(--color-accent)" />
        <h2 className="text-3xl md:text-5xl font-bold text-(--color-text-primary)">
          Courts in play
        </h2>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pb-6">
        {sorted.map((c) => (
          <KioskCourtCard key={c.id} court={c} />
        ))}
      </div>
    </section>
  )
}

function KioskCourtCard({ court }: { court: CourtSummary }) {
  const active = court.active_match
  const onDeck = court.on_deck_match
  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xl font-semibold text-(--color-text-primary)">
          {court.name}
        </h3>
        <StatusDot status={active?.status ?? null} />
      </div>
      {active ? (
        <KioskMatchLine match={active} liveBadge />
      ) : onDeck ? (
        <>
          <div className="text-xs uppercase tracking-widest text-(--color-text-muted) mb-2">
            On deck
          </div>
          <KioskMatchLine match={onDeck} />
        </>
      ) : (
        <div className="text-(--color-text-muted) italic">No match</div>
      )}
    </div>
  )
}

function KioskMatchLine({
  match,
  liveBadge,
}: {
  match: Match
  liveBadge?: boolean
}) {
  const t1 = match.team_1?.name ?? 'TBD'
  const t2 = match.team_2?.name ?? 'TBD'
  const score1 = match.team_1_score ?? 0
  const score2 = match.team_2_score ?? 0
  return (
    <div>
      <div className="text-xs text-(--color-text-muted) mb-2 flex items-center gap-2">
        <span>{match.tournament_name ?? ''}</span>
        {match.division_name ? (
          <span className="border-l border-(--color-border) pl-2">
            {match.division_name}
          </span>
        ) : null}
        {liveBadge ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider bg-(--color-error)/20 text-(--color-error)">
            ● Live
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between text-lg font-medium">
        <span className="truncate pr-2">{t1}</span>
        <span className="tabular-nums text-(--color-text-primary)">
          {score1}
        </span>
      </div>
      <div className="flex items-center justify-between text-lg font-medium">
        <span className="truncate pr-2">{t2}</span>
        <span className="tabular-nums text-(--color-text-primary)">
          {score2}
        </span>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: string | null }) {
  if (status === 'in_progress')
    return (
      <span className="inline-block h-3 w-3 rounded-full bg-(--color-success) animate-pulse" role="img" aria-label="In progress" />
    )
  if (status === 'paused')
    return (
      <span className="inline-block h-3 w-3 rounded-full bg-(--color-warning)" role="img" aria-label="Paused" />
    )
  if (status === 'completed')
    return (
      <span className="inline-block h-3 w-3 rounded-full bg-(--color-text-muted)" role="img" aria-label="Completed" />
    )
  return (
    <span className="inline-block h-3 w-3 rounded-full bg-(--color-bg-tertiary)" role="img" aria-label="Scheduled" />
  )
}

// ---------------------------------------------------------------------------
// Full-screen message (loading/error)
// ---------------------------------------------------------------------------

function FullScreenMessage({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Tv
  title: string
  subtitle?: string
}) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center text-(--color-text-primary) bg-(--color-bg-primary)">
      <Icon className="h-16 w-16 mb-6 text-(--color-accent)" />
      <div className="text-3xl font-semibold">{title}</div>
      {subtitle ? (
        <div className="mt-3 text-lg text-(--color-text-secondary)">
          {subtitle}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(start: string, end: string): string {
  if (!start) return ''
  const s = new Date(start)
  if (Number.isNaN(s.valueOf())) return ''
  const e = end ? new Date(end) : null
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  }
  const yearOpt: Intl.DateTimeFormatOptions = { ...opts, year: 'numeric' }
  if (!e || Number.isNaN(e.valueOf()) || start === end) {
    return s.toLocaleDateString(undefined, yearOpt)
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(
      undefined,
      yearOpt,
    )}`
  }
  return `${s.toLocaleDateString(undefined, yearOpt)} – ${e.toLocaleDateString(
    undefined,
    yearOpt,
  )}`
}

function formatBracketFormat(value: string): string {
  if (!value) return ''
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
