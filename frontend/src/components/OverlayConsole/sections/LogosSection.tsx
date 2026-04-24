import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import config from '../../../config'
import { ImageUpload } from '../controls/ImageUpload'
import type {
  CourtTheme,
  Match,
  MatchParticipant,
  Team,
} from '../../../types/domain'

interface LogosSectionProps {
  theme: CourtTheme
  onChange: (theme: CourtTheme) => void
  match: Match | null
  teams: Array<Team>
}

function RangeRow({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  step: number
  format: (n: number) => string
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase text-slate-400 mb-1">
        <span>{label}</span>
        <span className="text-slate-300 font-mono normal-case">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-lime-500"
      />
    </label>
  )
}

export function LogosSection({
  theme,
  onChange,
  match,
  teams,
}: LogosSectionProps) {
  const qc = useQueryClient()
  const [teamUploadError, setTeamUploadError] = useState<string | null>(null)

  const team1Participant = match?.participants.team_1 as
    | (MatchParticipant & { id?: number })
    | undefined
  const team2Participant = match?.participants.team_2 as
    | (MatchParticipant & { id?: number })
    | undefined

  const team1 = team1Participant?.id
    ? teams.find((t) => t.id === team1Participant.id)
    : undefined
  const team2 = team2Participant?.id
    ? teams.find((t) => t.id === team2Participant.id)
    : undefined

  const updateTeamLogo = useMutation({
    mutationFn: async ({ team, logoUrl }: { team: Team; logoUrl: string | null }) => {
      const res = await fetch(`${config.API_URL}/teams/${team.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: team.name,
          short_name: team.short_name ?? '',
          logo_url: logoUrl,
          primary_color: team.primary_color ?? null,
          player_ids: team.player_ids,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          detail?: string
        } | null
        throw new Error(data?.detail || `Team update failed (${res.status})`)
      }
      return res.json() as Promise<Team>
    },
    onSuccess: () => {
      setTeamUploadError(null)
      qc.invalidateQueries({ queryKey: ['teams'] })
      // Match participants cache is embedded in match query; invalidate it too.
      qc.invalidateQueries({ queryKey: ['match'] })
    },
    onError: (err: Error) => setTeamUploadError(err.message),
  })

  const resetBadgePosition = () => {
    onChange({
      ...theme,
      badgeLogoPosition: { x: 0, y: 0 },
      badgeLogoScale: 1,
    })
  }

  return (
    <div className="space-y-6">
      {/* Association / badge logo */}
      <section>
        <h4 className="text-xs font-bold uppercase text-slate-300 mb-2">
          Association Logo
        </h4>
        <ImageUpload
          label="Badge Image"
          description="Rendered in the left badge cell. Overrides the default wilson.webp."
          value={theme.images.associationLogo}
          onChange={(url) =>
            onChange({
              ...theme,
              images: { ...theme.images, associationLogo: url },
            })
          }
        />
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="accent-lime-500"
              checked={theme.images.hideDefaultAssociationLogo}
              onChange={(e) =>
                onChange({
                  ...theme,
                  images: {
                    ...theme.images,
                    hideDefaultAssociationLogo: e.target.checked,
                  },
                })
              }
            />
            Hide badge logo entirely
          </label>

          <RangeRow
            label="Badge logo zoom"
            value={theme.badgeLogoScale}
            onChange={(n) => onChange({ ...theme, badgeLogoScale: n })}
            min={0.5}
            max={10}
            step={0.05}
            format={(n) => `${Math.round(n * 100)}%`}
          />

          <div className="grid grid-cols-2 gap-3">
            <RangeRow
              label="X offset"
              value={theme.badgeLogoPosition.x}
              onChange={(n) =>
                onChange({
                  ...theme,
                  badgeLogoPosition: { ...theme.badgeLogoPosition, x: n },
                })
              }
              min={-80}
              max={80}
              step={1}
              format={(n) => `${n}px`}
            />
            <RangeRow
              label="Y offset"
              value={theme.badgeLogoPosition.y}
              onChange={(n) =>
                onChange({
                  ...theme,
                  badgeLogoPosition: { ...theme.badgeLogoPosition, y: n },
                })
              }
              min={-80}
              max={80}
              step={1}
              format={(n) => `${n}px`}
            />
          </div>

          <button
            type="button"
            onClick={resetBadgePosition}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset badge position &amp; zoom
          </button>
        </div>
      </section>

      {/* Team logos — registry-level writethrough */}
      <section>
        <h4 className="text-xs font-bold uppercase text-slate-300 mb-1">
          Team Logos
        </h4>
        <p className="text-[11px] text-slate-500 mb-3">
          These save to each team&apos;s registry entry, so every match they
          play uses the new logo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[team1, team2].map((team, idx) => {
            if (!team) {
              return (
                <div
                  key={idx}
                  className="bg-slate-900 border border-slate-700 border-dashed rounded-lg p-4 text-xs text-slate-500"
                >
                  Team {idx + 1} not set — configure the match to upload a
                  logo.
                </div>
              )
            }
            return (
              <div key={team.id}>
                <ImageUpload
                  label={`Team ${idx + 1}: ${team.name}`}
                  description="Saves to the team's registry logo."
                  value={team.logo_url ?? null}
                  onChange={(url) =>
                    updateTeamLogo.mutate({ team, logoUrl: url })
                  }
                />
              </div>
            )
          })}
        </div>
        {teamUploadError && (
          <div className="mt-2 text-xs text-red-400" role="alert">
            {teamUploadError}
          </div>
        )}

        <div className="mt-4">
          <RangeRow
            label="Team logo zoom"
            value={theme.teamLogoScale}
            onChange={(n) => onChange({ ...theme, teamLogoScale: n })}
            min={0.5}
            max={10}
            step={0.05}
            format={(n) => `${Math.round(n * 100)}%`}
          />
        </div>
      </section>
    </div>
  )
}
