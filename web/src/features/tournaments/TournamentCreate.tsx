import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useCreateTournament,
  useSearchLeagues,
  useLeagueSeasons,
  type League,
  type Season,
} from './hooks'
import {
  useListDivisionTemplates,
  type DivisionTemplate,
} from '../leagues/hooks'
import type { SponsorEntry } from '../../components/SponsorEditor'
import { useDebounce } from '../../hooks/useDebounce'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { DateInput } from '../../components/DateInput'
import { Textarea } from '../../components/Textarea'
import { Select } from '../../components/Select'
import { FormField } from '../../components/FormField'
import { Card } from '../../components/Card'
import { VenuePicker } from '../../components/VenuePicker'
import { ImageUpload } from '../../components/ImageUpload'
import { SponsorEditor } from '../../components/SponsorEditor'
import { ScoringPresetPicker } from '../../components/ScoringPresetPicker'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/formatters'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, FileDown } from 'lucide-react'

import { useSport } from '../../auth/SportContext'
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ['Basic Info', 'Divisions', 'Review & Create'] as const

const FORMAT_OPTIONS = [
  { value: 'singles', label: 'Singles' },
  { value: 'doubles', label: 'Doubles' },
  { value: 'mixed_doubles', label: 'Mixed Doubles' },
  { value: 'team_match', label: 'Team Match' },
]

const GENDER_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'mens', label: "Men's" },
  { value: 'womens', label: "Women's" },
  { value: 'mixed', label: 'Mixed' },
]

const BRACKET_FORMAT_OPTIONS = [
  { value: 'single_elimination', label: 'Single Elimination' },
  { value: 'double_elimination', label: 'Double Elimination' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'pool_play', label: 'Pool Play' },
  { value: 'pool_to_bracket', label: 'Pool to Bracket' },
]

// Values MUST match CHECK constraint in api/db/migrations/00011_create_divisions.sql
const REGISTRATION_MODE_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'invite_only', label: 'Invite Only' },
]

const SEED_METHOD_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'rating', label: 'By Rating' },
  { value: 'random', label: 'Random' },
]

// ---------------------------------------------------------------------------
// Division form data
// ---------------------------------------------------------------------------

interface DivisionDraft {
  name: string
  format: string
  gender_restriction: string
  bracket_format: string
  scoring_preset_id: number | null
  max_teams: string
  max_roster_size: string
  entry_fee_amount: string
  entry_fee_currency: string
  auto_approve: boolean
  registration_mode: string
  seed_method: string
}

const EMPTY_DIVISION: DivisionDraft = {
  name: '',
  format: 'doubles',
  gender_restriction: 'open',
  bracket_format: 'double_elimination',
  scoring_preset_id: null,
  max_teams: '',
  max_roster_size: '',
  entry_fee_amount: '',
  entry_fee_currency: 'USD',
  auto_approve: false,
  registration_mode: 'open',
  seed_method: 'manual',
}

function templateToDraft(t: DivisionTemplate): DivisionDraft {
  return {
    name: t.name,
    format: t.format,
    gender_restriction: t.gender_restriction,
    bracket_format: t.bracket_format,
    scoring_preset_id: t.scoring_preset_id,
    max_teams: t.max_teams != null ? String(t.max_teams) : '',
    max_roster_size: t.max_roster_size != null ? String(t.max_roster_size) : '',
    entry_fee_amount: t.entry_fee_amount ?? '',
    entry_fee_currency: t.entry_fee_currency || 'USD',
    auto_approve: t.auto_approve,
    registration_mode: t.registration_mode || 'open',
    seed_method: t.seed_method || 'manual',
  }
}

// ---------------------------------------------------------------------------
// Tournament form data
// ---------------------------------------------------------------------------

interface TournamentFormData {
  name: string
  start_date: string
  end_date: string
  venue_id: number | null
  league_id: number | null
  season_id: number | null
  description: string
  contact_email: string
  contact_phone: string
  website_url: string
  rules_document_url: string
  logo_url: string | null
  banner_url: string | null
  sponsors: SponsorEntry[]
}

const INITIAL_FORM: TournamentFormData = {
  name: '',
  start_date: '',
  end_date: '',
  venue_id: null,
  league_id: null,
  season_id: null,
  description: '',
  contact_email: '',
  contact_phone: '',
  website_url: '',
  rules_document_url: '',
  logo_url: null,
  banner_url: null,
  sponsors: [],
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center">
        {STEPS.map((label, i) => {
          const isComplete = i < currentStep
          const isCurrent = i === currentStep
          return (
            <li key={label} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium border-2 transition-colors',
                    isComplete && 'border-cyan-500 bg-cyan-500 text-white',
                    isCurrent && 'border-cyan-500 text-cyan-500 bg-transparent',
                    !isComplete && !isCurrent && 'border-(--color-border) text-(--color-text-secondary) bg-transparent',
                  )}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium hidden sm:inline',
                    isCurrent ? 'text-(--color-text-primary)' : 'text-(--color-text-secondary)',
                  )}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'mx-4 h-0.5 flex-1',
                    isComplete ? 'bg-cyan-500' : 'bg-(--color-border)',
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Division form component
// ---------------------------------------------------------------------------

function DivisionForm({
  draft,
  onChange,
  onSave,
  onCancel,
}: {
  draft: DivisionDraft
  onChange: (d: DivisionDraft) => void
  onSave: () => void
  onCancel: () => void
}) {
  const update = <K extends keyof DivisionDraft>(key: K, value: DivisionDraft[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Division Name" required>
          <Input
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Men's Pro Doubles"
          />
        </FormField>
        <FormField label="Format">
          <Select value={draft.format} onChange={(e) => update('format', e.target.value)}>
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Gender Restriction">
          <Select value={draft.gender_restriction} onChange={(e) => update('gender_restriction', e.target.value)}>
            {GENDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Bracket Format">
          <Select value={draft.bracket_format} onChange={(e) => update('bracket_format', e.target.value)}>
            {BRACKET_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Scoring Preset">
          <ScoringPresetPicker
            value={draft.scoring_preset_id}
            onChange={(id) => update('scoring_preset_id', id)}
          />
        </FormField>
        <FormField label="Registration Mode">
          <Select value={draft.registration_mode} onChange={(e) => update('registration_mode', e.target.value)}>
            {REGISTRATION_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Seed Method">
          <Select value={draft.seed_method} onChange={(e) => update('seed_method', e.target.value)}>
            {SEED_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Max Teams">
          <Input
            type="number"
            value={draft.max_teams}
            onChange={(e) => update('max_teams', e.target.value)}
            placeholder="No limit"
            min={0}
          />
        </FormField>
        <FormField label="Max Roster Size">
          <Input
            type="number"
            value={draft.max_roster_size}
            onChange={(e) => update('max_roster_size', e.target.value)}
            placeholder="No limit"
            min={0}
          />
        </FormField>
        <FormField label="Entry Fee">
          <div className="flex gap-2">
            <Input
              type="number"
              value={draft.entry_fee_amount}
              onChange={(e) => update('entry_fee_amount', e.target.value)}
              placeholder="0.00"
              min={0}
              step="0.01"
              className="flex-1"
            />
            <Select
              value={draft.entry_fee_currency}
              onChange={(e) => update('entry_fee_currency', e.target.value)}
              className="w-24"
            >
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </Select>
          </div>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm text-(--color-text-secondary)">
        <input
          type="checkbox"
          checked={draft.auto_approve}
          onChange={(e) => update('auto_approve', e.target.checked)}
          className="rounded"
        />
        Auto-approve registrations
      </label>
      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={onSave} disabled={!draft.name.trim()}>
          Save Division
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Division summary card
// ---------------------------------------------------------------------------

function DivisionCard({
  division,
  onEdit,
  onRemove,
}: {
  division: DivisionDraft
  onEdit: () => void
  onRemove: () => void
}) {
  const format = FORMAT_OPTIONS.find((o) => o.value === division.format)?.label ?? division.format
  const bracket = BRACKET_FORMAT_OPTIONS.find((o) => o.value === division.bracket_format)?.label ?? division.bracket_format

  return (
    <Card className="flex items-start justify-between">
      <div className="space-y-1">
        <p className="font-medium text-(--color-text-primary)">{division.name}</p>
        <p className="text-sm text-(--color-text-secondary)">
          {format} &middot; {bracket}
        </p>
        {division.entry_fee_amount && (
          <p className="text-sm text-(--color-text-secondary)">
            Entry fee: {division.entry_fee_currency} {division.entry_fee_amount}
          </p>
        )}
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} className="p-1.5 text-(--color-text-secondary) hover:text-cyan-400" aria-label="Edit division">
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" onClick={onRemove} className="p-1.5 text-(--color-text-secondary) hover:text-red-400" aria-label="Remove division">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Template picker for importing division templates
// ---------------------------------------------------------------------------

function TemplatePicker({
  templates,
  onImport,
  onCancel,
}: {
  templates: DivisionTemplate[]
  onImport: (selected: DivisionTemplate[]) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(templates.map((t) => t.id)))
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-(--color-text-primary)">Select Templates to Import</h4>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-cyan-500 hover:text-cyan-400"
          >
            Select All
          </button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {templates.map((t) => {
            const fmt = FORMAT_OPTIONS.find((o) => o.value === t.format)?.label ?? t.format
            const bracket = BRACKET_FORMAT_OPTIONS.find((o) => o.value === t.bracket_format)?.label ?? t.bracket_format
            return (
              <label
                key={t.id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-(--color-bg-hover) cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="rounded border-(--color-border)"
                />
                <div>
                  <p className="text-sm font-medium text-(--color-text-primary)">{t.name}</p>
                  <p className="text-xs text-(--color-text-secondary)">
                    {fmt} &middot; {bracket}
                  </p>
                </div>
              </label>
            )
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-(--color-border)">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={() => onImport(templates.filter((t) => selected.has(t.id)))}
          >
            Import {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// League picker (inline searchable)
// ---------------------------------------------------------------------------

function LeaguePicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (leagueId: number | null, leagueName: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query)
  const { data } = useSearchLeagues(debouncedQuery)
  const leagues = data?.items ?? []
  const [open, setOpen] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-(--color-text-primary)">{selectedName ?? `League #${value}`}</span>
          <button
            type="button"
            onClick={() => {
              onChange(null, null)
              setSelectedName(null)
              setQuery('')
            }}
            className="text-xs text-(--color-text-secondary) hover:text-red-400"
          >
            Clear
          </button>
        </div>
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search leagues..."
          />
          {open && debouncedQuery && leagues.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg-primary) shadow-lg max-h-48 overflow-y-auto">
              {leagues.map((l: League) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    onChange(l.id, l.name)
                    setSelectedName(l.name)
                    setOpen(false)
                    setQuery('')
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-(--color-bg-hover) transition-colors text-(--color-text-primary)"
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
          {open && debouncedQuery && leagues.length === 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg-primary) shadow-lg px-3 py-2 text-sm text-(--color-text-secondary)">
              No leagues found
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Season dropdown
// ---------------------------------------------------------------------------

function SeasonPicker({
  leagueId,
  value,
  onChange,
}: {
  leagueId: number | null
  value: number | null
  onChange: (seasonId: number | null) => void
}) {
  const { data: seasons } = useLeagueSeasons(leagueId)
  if (!leagueId) return null

  return (
    <FormField label="Season">
      <Select
        value={value ? String(value) : ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Select season...</option>
        {(seasons ?? []).map((s: Season) => (
          <option key={s.id} value={String(s.id)}>{s.name}</option>
        ))}
      </Select>
    </FormField>
  )
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export function TournamentCreate() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const createTournament = useCreateTournament()

  const [step, setStep] = useState(0)
  const [form, setForm] = useState<TournamentFormData>({ ...INITIAL_FORM })
  const [divisions, setDivisions] = useState<DivisionDraft[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Division editing state
  const [editingDivisionIndex, setEditingDivisionIndex] = useState<number | null>(null)
  const [divisionDraft, setDivisionDraft] = useState<DivisionDraft>({ ...EMPTY_DIVISION })
  const [showDivisionForm, setShowDivisionForm] = useState(false)

  const updateField = <K extends keyof TournamentFormData>(key: K, value: TournamentFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  // Step 1 validation
  function validateStep1(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Tournament name is required'
    if (!form.start_date) errs.start_date = 'Start date is required'
    if (!form.end_date) errs.end_date = 'End date is required'
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      errs.end_date = 'End date must be on or after start date'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleNext() {
    if (step === 0 && !validateStep1()) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  // Division management
  function handleAddDivision() {
    setDivisionDraft({ ...EMPTY_DIVISION })
    setEditingDivisionIndex(null)
    setShowDivisionForm(true)
  }

  function handleEditDivision(index: number) {
    setDivisionDraft({ ...divisions[index] })
    setEditingDivisionIndex(index)
    setShowDivisionForm(true)
  }

  function handleSaveDivision() {
    if (editingDivisionIndex !== null) {
      setDivisions((prev) => prev.map((d, i) => (i === editingDivisionIndex ? { ...divisionDraft } : d)))
    } else {
      setDivisions((prev) => [...prev, { ...divisionDraft }])
    }
    setShowDivisionForm(false)
    setEditingDivisionIndex(null)
  }

  function handleRemoveDivision(index: number) {
    setDivisions((prev) => prev.filter((_, i) => i !== index))
  }

  function handleCancelDivision() {
    setShowDivisionForm(false)
    setEditingDivisionIndex(null)
  }

  // Division templates
  const templates = useListDivisionTemplates(form.league_id)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  function handleImportTemplates(selected: DivisionTemplate[]) {
    const drafts = selected.map(templateToDraft)
    setDivisions((prev) => [...prev, ...drafts])
    setShowTemplatePicker(false)
    toast('success', `Imported ${selected.length} division${selected.length !== 1 ? 's' : ''} from templates`)
  }

  // Submit
  async function handleSubmit(status: 'draft' | 'published') {
    const payload: Record<string, unknown> = {
      name: form.name,
      status,
      start_date: form.start_date,
      end_date: form.end_date,
      venue_id: form.venue_id,
      league_id: form.league_id,
      season_id: form.season_id,
      description: form.description || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      website_url: form.website_url || null,
      rules_document_url: form.rules_document_url || null,
      logo_url: form.logo_url,
      banner_url: form.banner_url,
      sponsor_info: form.sponsors.length > 0 ? form.sponsors : null,
      divisions: divisions.map((d) => ({
        name: d.name,
        format: d.format,
        gender_restriction: d.gender_restriction,
        bracket_format: d.bracket_format,
        scoring_format: d.scoring_preset_id ? String(d.scoring_preset_id) : null,
        max_teams: d.max_teams ? Number(d.max_teams) : null,
        max_roster_size: d.max_roster_size ? Number(d.max_roster_size) : null,
        entry_fee_amount: d.entry_fee_amount ? Number(d.entry_fee_amount) : null,
        entry_fee_currency: d.entry_fee_currency,
        auto_approve: d.auto_approve,
        registration_mode: d.registration_mode,
        seed_method: d.seed_method,
      })),
    }

    try {
      const result = await createTournament.mutateAsync(payload as Partial<import('./hooks').Tournament>)
      toast('success', `Tournament ${status === 'draft' ? 'saved as draft' : 'created and published'}`)
      navigate({ to: '/$sport/tournaments/$tournamentId', params: { sport: sportSlug, tournamentId: String(result.id) } })
    } catch (err) {
      toast('error', (err as Error).message || 'Failed to create tournament')
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-(--color-text-primary) mb-2">Create Tournament</h1>
      <p className="text-sm text-(--color-text-secondary) mb-6">
        Set up your tournament in a few simple steps.
      </p>

      <StepIndicator currentStep={step} />

      {/* Step 1: Basic Info */}
      {step === 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Tournament Name" required error={errors.name} className="md:col-span-2">
              <Input
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Spring Classic 2026"
                error={!!errors.name}
              />
            </FormField>
            <FormField label="Start Date" required error={errors.start_date}>
              <DateInput
                value={form.start_date}
                onChange={(e) => updateField('start_date', e.target.value)}
                error={!!errors.start_date}
              />
            </FormField>
            <FormField label="End Date" required error={errors.end_date}>
              <DateInput
                value={form.end_date}
                onChange={(e) => updateField('end_date', e.target.value)}
                min={form.start_date || undefined}
                error={!!errors.end_date}
              />
            </FormField>
          </div>

          <FormField label="Venue">
            <VenuePicker value={form.venue_id} onChange={(id) => updateField('venue_id', id)} />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="League">
              <LeaguePicker
                value={form.league_id}
                onChange={(id) => {
                  updateField('league_id', id)
                  if (!id) updateField('season_id', null)
                }}
              />
            </FormField>
            <SeasonPicker
              leagueId={form.league_id}
              value={form.season_id}
              onChange={(id) => updateField('season_id', id)}
            />
          </div>

          <FormField label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe your tournament..."
              rows={3}
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Contact Email">
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => updateField('contact_email', e.target.value)}
                placeholder="tournaments@example.org"
              />
            </FormField>
            <FormField label="Contact Phone">
              <Input
                type="tel"
                value={form.contact_phone}
                onChange={(e) => updateField('contact_phone', e.target.value)}
                placeholder="(555) 123-4567"
              />
            </FormField>
            <FormField label="Website URL">
              <Input
                value={form.website_url}
                onChange={(e) => updateField('website_url', e.target.value)}
                placeholder="https://"
              />
            </FormField>
            <FormField label="Rules Document URL">
              <Input
                value={form.rules_document_url}
                onChange={(e) => updateField('rules_document_url', e.target.value)}
                placeholder="https://"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUpload
              label="Logo"
              value={form.logo_url}
              onChange={(url) => updateField('logo_url', url)}
            />
            <ImageUpload
              label="Banner"
              value={form.banner_url}
              onChange={(url) => updateField('banner_url', url)}
            />
          </div>

          <SponsorEditor
            value={form.sponsors}
            onChange={(sponsors) => updateField('sponsors', sponsors)}
          />

          <div className="flex justify-end pt-4">
            <Button onClick={handleNext}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Divisions */}
      {step === 1 && (
        <div className="space-y-4">
          {divisions.length === 0 && !showDivisionForm && (
            <div className="text-center py-8 text-(--color-text-secondary)">
              <p className="mb-4">No divisions added yet. Add at least one division.</p>
            </div>
          )}

          {divisions.map((d, i) => (
            <DivisionCard
              key={i}
              division={d}
              onEdit={() => handleEditDivision(i)}
              onRemove={() => handleRemoveDivision(i)}
            />
          ))}

          {showDivisionForm ? (
            <DivisionForm
              draft={divisionDraft}
              onChange={setDivisionDraft}
              onSave={handleSaveDivision}
              onCancel={handleCancelDivision}
            />
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={handleAddDivision}>
                <Plus className="h-4 w-4" /> Add Division
              </Button>
              {form.league_id && templates.data && templates.data.length > 0 && (
                <Button variant="secondary" onClick={() => setShowTemplatePicker(true)}>
                  <FileDown className="h-4 w-4" /> Import from Templates
                </Button>
              )}
            </div>
          )}

          {showTemplatePicker && templates.data && (
            <TemplatePicker
              templates={templates.data}
              onImport={handleImportTemplates}
              onCancel={() => setShowTemplatePicker(false)}
            />
          )}

          <div className="flex justify-between pt-4">
            <Button variant="secondary" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={handleNext}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Create */}
      {step === 2 && (
        <div className="space-y-6">
          {/* Tournament summary */}
          <Card>
            <h3 className="text-lg font-semibold text-(--color-text-primary) mb-3">Tournament Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 text-sm">
              <SummaryRow label="Name" value={form.name} />
              <SummaryRow label="Start Date" value={formatDate(form.start_date)} />
              <SummaryRow label="End Date" value={formatDate(form.end_date)} />
              <SummaryRow label="Venue" value={form.venue_id ? `Venue #${form.venue_id}` : '\u2014'} />
              <SummaryRow label="League" value={form.league_id ? `League #${form.league_id}` : '\u2014'} />
              {form.contact_email && <SummaryRow label="Email" value={form.contact_email} />}
              {form.contact_phone && <SummaryRow label="Phone" value={form.contact_phone} />}
              {form.website_url && <SummaryRow label="Website" value={form.website_url} />}
            </div>
            {form.description && (
              <div className="mt-3 pt-3 border-t border-(--color-border)">
                <p className="text-sm text-(--color-text-secondary)">{form.description}</p>
              </div>
            )}
          </Card>

          {/* Divisions summary */}
          <div>
            <h3 className="text-lg font-semibold text-(--color-text-primary) mb-3">
              Divisions ({divisions.length})
            </h3>
            {divisions.length === 0 ? (
              <p className="text-sm text-(--color-text-secondary)">No divisions added.</p>
            ) : (
              <div className="space-y-3">
                {divisions.map((d, i) => {
                  const format = FORMAT_OPTIONS.find((o) => o.value === d.format)?.label ?? d.format
                  const bracket = BRACKET_FORMAT_OPTIONS.find((o) => o.value === d.bracket_format)?.label ?? d.bracket_format
                  return (
                    <Card key={i}>
                      <p className="font-medium text-(--color-text-primary)">{d.name}</p>
                      <p className="text-sm text-(--color-text-secondary)">
                        {format} &middot; {bracket}
                        {d.max_teams && ` \u00B7 Max ${d.max_teams} teams`}
                        {d.entry_fee_amount && ` \u00B7 ${d.entry_fee_currency} ${d.entry_fee_amount}`}
                      </p>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sponsors summary */}
          {form.sponsors.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-(--color-text-primary) mb-3">
                Sponsors ({form.sponsors.length})
              </h3>
              <div className="space-y-2">
                {form.sponsors.map((s, i) => (
                  <Card key={i}>
                    <p className="font-medium text-(--color-text-primary)">{s.name}</p>
                    <p className="text-sm text-(--color-text-secondary) capitalize">{s.tier} tier</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4">
            <Button variant="secondary" onClick={handleBack}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => handleSubmit('draft')}
                loading={createTournament.isPending}
              >
                Save as Draft
              </Button>
              <Button
                onClick={() => handleSubmit('published')}
                loading={createTournament.isPending}
              >
                Create & Publish
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-(--color-text-secondary)">{label}</span>
      <span className="text-(--color-text-primary) font-medium">{value}</span>
    </div>
  )
}
