import { Eraser } from 'lucide-react'
import { DEFAULT_TEXT_OVERRIDES } from '../../../utils/theme'
import { TextOverrideInput } from '../controls/TextOverrideInput'
import type {
  CourtTheme,
  CourtThemeTextOverrides,
  Match,
  MatchParticipant,
} from '../../../types/domain'

interface OverridesSectionProps {
  theme: CourtTheme
  onChange: (theme: CourtTheme) => void
  match: Match | null
}

function liveTeamName(p: MatchParticipant | undefined, fallback: string): string {
  return p?.name || fallback
}

function livePlayers(p: MatchParticipant | undefined): string {
  const p1 = p?.player_1?.display_name
  const p2 = p?.player_2?.display_name
  if (p1 && p2) return `${p1} & ${p2}`
  if (p1) return p1
  if (p2) return p2
  return ''
}

export function OverridesSection({
  theme,
  onChange,
  match,
}: OverridesSectionProps) {
  const setOverride = (key: keyof CourtThemeTextOverrides, value: string) => {
    onChange({
      ...theme,
      textOverrides: { ...theme.textOverrides, [key]: value },
    })
  }

  const clearAll = () => {
    onChange({ ...theme, textOverrides: { ...DEFAULT_TEXT_OVERRIDES } })
  }

  const liveLeague = match?.league_name || ''
  const liveTournament = match?.tournament_name || ''
  const liveMatchInfo = match?.match_info || ''

  const team1 = match?.participants.team_1
  const team2 = match?.participants.team_2

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-400">
          Leave blank to fall back to live data. Placeholders show the current
          live value.
        </p>
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors flex-shrink-0"
        >
          <Eraser className="w-3 h-3" /> Clear all
        </button>
      </div>

      {/* Header */}
      <section className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase text-slate-300">
          Header
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextOverrideInput
            label="League / Association"
            value={theme.textOverrides.leagueName}
            liveValue={liveLeague}
            onChange={(v) => setOverride('leagueName', v)}
          />
          <TextOverrideInput
            label="Tournament"
            value={theme.textOverrides.tournamentName}
            liveValue={liveTournament}
            onChange={(v) => setOverride('tournamentName', v)}
          />
        </div>
        <TextOverrideInput
          label="Header extra (optional third segment)"
          value={theme.textOverrides.headerExtra}
          liveValue=""
          onChange={(v) => setOverride('headerExtra', v)}
        />
      </section>

      {/* Team 1 */}
      <section className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase text-slate-300">
          Team 1
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextOverrideInput
            label="Name"
            value={theme.textOverrides.team1Name}
            liveValue={liveTeamName(team1, '')}
            onChange={(v) => setOverride('team1Name', v)}
          />
          <TextOverrideInput
            label="Score"
            value={theme.textOverrides.team1Score}
            liveValue={
              match ? String(match.team_1_score) : ''
            }
            onChange={(v) => setOverride('team1Score', v)}
          />
        </div>
        <TextOverrideInput
          label="Players"
          value={theme.textOverrides.team1Players}
          liveValue={livePlayers(team1)}
          onChange={(v) => setOverride('team1Players', v)}
        />
      </section>

      {/* Team 2 */}
      <section className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase text-slate-300">
          Team 2
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TextOverrideInput
            label="Name"
            value={theme.textOverrides.team2Name}
            liveValue={liveTeamName(team2, '')}
            onChange={(v) => setOverride('team2Name', v)}
          />
          <TextOverrideInput
            label="Score"
            value={theme.textOverrides.team2Score}
            liveValue={
              match ? String(match.team_2_score) : ''
            }
            onChange={(v) => setOverride('team2Score', v)}
          />
        </div>
        <TextOverrideInput
          label="Players"
          value={theme.textOverrides.team2Players}
          liveValue={livePlayers(team2)}
          onChange={(v) => setOverride('team2Players', v)}
        />
      </section>

      {/* Footer */}
      <section className="space-y-3">
        <h4 className="text-[11px] font-bold uppercase text-slate-300">
          Footer
        </h4>
        <TextOverrideInput
          label="Match Info"
          value={theme.textOverrides.matchInfo}
          liveValue={liveMatchInfo}
          onChange={(v) => setOverride('matchInfo', v)}
        />
        <TextOverrideInput
          label="Footer extra (optional)"
          value={theme.textOverrides.footerExtra}
          liveValue=""
          onChange={(v) => setOverride('footerExtra', v)}
          textarea
        />
      </section>
    </div>
  )
}
