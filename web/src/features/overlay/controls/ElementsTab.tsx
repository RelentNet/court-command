// web/src/features/overlay/controls/ElementsTab.tsx
//
// Control Panel: Elements tab.
//
// Per-element controls for the 12 canonical overlay elements. Each
// element has a visibility toggle (the primary on/off) and optionally
// a small set of per-element knobs (rotation cadence, auto-dismiss
// timers, text content, zone placement). Updates flow through the
// single PUT /config/elements endpoint — we merge locally, debounce,
// then send the whole ElementsConfig object server-side in one call.
//
// Grouping: elements are organized by visual zone so the operator can
// scan the UI and understand where each element lives on-screen.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Eye, Loader2 } from 'lucide-react'
import { Input } from '../../../components/Input'
import { Select } from '../../../components/Select'
import { FormField } from '../../../components/FormField'
import { useToast } from '../../../components/Toast'
import { cn } from '../../../lib/cn'
import type {
  CourtOverlayConfig,
  CustomTextConfig,
  CustomTextFont,
  ElementsConfig,
  MatchResultConfig,
  PlayerCardConfig,
  PlayerCardSlot,
  ScoreboardConfig,
  ScoreboardLayout,
  SponsorBugConfig,
  TeamCardConfig,
  TeamCardSelection,
} from '../types'
import { ELEMENT_KEY, type ElementKey } from '../contract'
import { useOverlayData, useUpdateElements } from '../hooks'
import { SCOREBOARD_LAYOUT_OPTIONS } from '../renderer/elements/scoreboard'
import {
  OFFSET_MAX,
  OFFSET_MIN,
  OFFSET_STEP,
  POSITION_OPTIONS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
} from '../renderer/elements/scoreboard/transforms'
import type { ElementConfigBase, ElementPosition } from '../types'
import {
  ELEMENT_SCALE_MAX,
  ELEMENT_SCALE_MIN,
  ELEMENT_SCALE_STEP,
} from '../renderer/elementScale'

// Debounce interval for text / number inputs before firing the PUT.
const COMMIT_DEBOUNCE_MS = 400

// Visual grouping for the UI (does not affect the wire shape).
interface ElementGroup {
  label: string
  description: string
  keys: ElementKey[]
}

const ELEMENT_GROUPS: ElementGroup[] = [
  {
    label: 'Core',
    description: 'Always-on elements that carry live scoreboard data.',
    keys: [ELEMENT_KEY.SCOREBOARD, ELEMENT_KEY.SERIES_SCORE],
  },
  {
    label: 'Branding',
    description: 'Sponsor rotator, tournament logo, and match banners.',
    keys: [
      ELEMENT_KEY.SPONSOR_BUG,
      ELEMENT_KEY.TOURNAMENT_BUG,
      ELEMENT_KEY.LOWER_THIRD,
    ],
  },
  {
    label: 'Cards & callouts',
    description:
      'Trigger-fired overlays for player intros, team rosters, and operator text.',
    keys: [
      ELEMENT_KEY.PLAYER_CARD,
      ELEMENT_KEY.TEAM_CARD,
      ELEMENT_KEY.MATCH_RESULT,
      ELEMENT_KEY.CUSTOM_TEXT,
    ],
  },
  {
    label: 'Tournament context',
    description: 'Narrative elements shown between matches.',
    keys: [
      ELEMENT_KEY.COMING_UP_NEXT,
      ELEMENT_KEY.BRACKET_SNAPSHOT,
      ELEMENT_KEY.POOL_STANDINGS,
    ],
  },
]

const ELEMENT_LABELS: Record<ElementKey, string> = {
  scoreboard: 'Scoreboard',
  lower_third: 'Lower third',
  player_card: 'Player card',
  team_card: 'Team card',
  sponsor_bug: 'Sponsor bug',
  tournament_bug: 'Tournament bug',
  coming_up_next: 'Coming up next',
  match_result: 'Match result',
  custom_text: 'Custom text',
  bracket_snapshot: 'Bracket snapshot',
  pool_standings: 'Pool standings',
  series_score: 'Series score',
}

const ELEMENT_DESCRIPTIONS: Record<ElementKey, string> = {
  scoreboard:
    'Bottom-left persistent scoreboard with team rows, serve indicator, game history, and timeouts.',
  lower_third: 'Full-width announcement banner. Slides up from the bottom.',
  player_card: 'Center-bottom card introducing a selected player.',
  team_card: 'Center-bottom card showing both rosters side-by-side.',
  sponsor_bug: 'Top-right rotating sponsor logos.',
  tournament_bug: 'Top-left static tournament or league mark.',
  coming_up_next:
    'Top-center banner teasing the next match in the court queue.',
  match_result:
    'Full-center winner reveal with confetti. Shown at match completion.',
  custom_text: 'Operator-controlled free-form text banner.',
  bracket_snapshot: 'Full-center bracket snapshot (between-match narrative).',
  pool_standings:
    'Full-center pool standings table (between-match narrative).',
  series_score: 'Top-right dot grid showing BO3/BO5/BO7 series progress.',
}

const DISMISS_OPTIONS = [
  { value: '0', label: 'Manual (stay until dismissed)' },
  { value: '5', label: 'Auto dismiss after 5s' },
  { value: '10', label: 'Auto dismiss after 10s' },
  { value: '30', label: 'Auto dismiss after 30s' },
  { value: '60', label: 'Auto dismiss after 60s' },
]

interface ElementsTabProps {
  courtID: number
  config: CourtOverlayConfig | undefined
  loading: boolean
}

export function ElementsTab({ courtID, config, loading }: ElementsTabProps) {
  const { toast } = useToast()
  const updateElements = useUpdateElements(courtID)

  // Local draft that reflects the server config but can be edited
  // freely. The debounce timer flushes to the server.
  const [draft, setDraft] = useState<ElementsConfig | null>(null)
  const flushTimer = useRef<number | null>(null)
  const pendingRef = useRef<ElementsConfig | null>(null)

  useEffect(() => {
    if (config?.elements) {
      setDraft(config.elements)
    }
  }, [config?.elements])

  // Clean up timer on unmount.
  useEffect(() => () => {
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
  }, [])

  function commit(next: ElementsConfig) {
    pendingRef.current = next
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending) return
      updateElements.mutate(
        { elements: pending },
        {
          onError: (err) => {
            toast('error', err.message || 'Could not save element settings')
          },
        },
      )
    }, COMMIT_DEBOUNCE_MS)
  }

  function patch<K extends ElementKey>(
    key: K,
    patchValue: Partial<ElementsConfig[K]>,
  ) {
    if (!draft) return
    const next: ElementsConfig = {
      ...draft,
      [key]: { ...draft[key], ...patchValue },
    }
    setDraft(next)
    commit(next)
  }

  if (loading || !draft) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-(--color-text-secondary)">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading elements…</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SaveIndicator pending={updateElements.isPending} />

      {/* Top: scannable toggle grid grouped by zone, collapsible so
          operators can keep the preview visible while working the
          Settings section below. */}
      <VisibilitySection courtID={courtID} draft={draft} patch={patch} />

      {/* Bottom: collapsibles for elements that have knobs. */}
      <section aria-label="Element settings">
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-(--color-text-primary) uppercase tracking-wider">
            Settings
          </h2>
          <p className="text-xs text-(--color-text-secondary) mt-0.5">
            Expand an element below to adjust its knobs (rotation speed,
            auto-dismiss timers, default text).
          </p>
        </header>
        <div className="space-y-2">
          {ALL_KEYS_FLAT.filter(elementHasKnobs).map((key) => (
            <SettingsRow
              key={key}
              elementKey={key}
              config={draft[key]}
              onPatch={(p) => patch(key, p)}
              courtID={courtID}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// Flat iteration order mirroring ELEMENT_GROUPS so settings appear in
// the same visual order as the toggle grid above.
const ALL_KEYS_FLAT: ElementKey[] = ELEMENT_GROUPS.flatMap((g) => g.keys)

// ---------------------------------------------------------------------------
// VisibilitySection — collapsible wrapper around the toggle grid.
// Persists its open/closed state in sessionStorage keyed by courtID so
// the operator's preference sticks when flipping between tabs.
// ---------------------------------------------------------------------------

interface VisibilitySectionProps {
  courtID: number
  draft: ElementsConfig
  patch: <K extends ElementKey>(
    key: K,
    patchValue: Partial<ElementsConfig[K]>,
  ) => void
}

function VisibilitySection({ courtID, draft, patch }: VisibilitySectionProps) {
  const storageKey = `cc:overlay:elements-visibility-collapsed:${courtID}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.sessionStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(storageKey, collapsed ? '1' : '0')
    } catch {
      // sessionStorage can throw in private mode — ignore
    }
  }, [collapsed, storageKey])

  const regionId = `elements-visibility-${courtID}`

  return (
    <section aria-label="Element visibility">
      <header
        className={cn(
          'flex items-center justify-between gap-4 rounded-lg border border-(--color-border) bg-(--color-bg-secondary) px-4 py-3',
          collapsed ? 'rounded-lg' : 'rounded-b-none border-b-0',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Eye className="h-4 w-4 text-(--color-text-secondary) shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-(--color-text-primary) uppercase tracking-wider">
              Visibility
            </h2>
            <p className="text-xs text-(--color-text-secondary) truncate">
              Toggle elements on or off. Collapse to give the preview more
              room while editing settings.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls={regionId}
          className="inline-flex items-center gap-1.5 shrink-0 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded px-2 py-1"
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Hide
            </>
          )}
        </button>
      </header>

      {!collapsed && (
        <div
          id={regionId}
          className="space-y-5 rounded-b-lg border border-t-0 border-(--color-border) bg-(--color-bg-secondary) px-4 pt-4 pb-5"
        >
          {ELEMENT_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-xs font-semibold text-(--color-text-secondary) uppercase tracking-wider">
                  {group.label}
                </h3>
                <p className="text-xs text-(--color-text-muted) truncate">
                  {group.description}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.keys.map((key) => (
                  <ToggleCell
                    key={key}
                    elementKey={key}
                    visible={draft[key].visible}
                    hasKnobs={elementHasKnobs(key)}
                    onToggle={(visible) =>
                      patch(key, { visible } as Partial<
                        ElementsConfig[typeof key]
                      >)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// ToggleCell — compact visibility toggle used in the grid
// ---------------------------------------------------------------------------

interface ToggleCellProps {
  elementKey: ElementKey
  visible: boolean
  hasKnobs: boolean
  onToggle: (visible: boolean) => void
}

function ToggleCell({
  elementKey,
  visible,
  hasKnobs,
  onToggle,
}: ToggleCellProps) {
  const rowId = `toggle-${elementKey}`
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        visible
          ? 'border-cyan-500/40 bg-(--color-bg-secondary)'
          : 'border-(--color-border) bg-(--color-bg-primary)',
      )}
    >
      <div className="flex-1 min-w-0">
        <label
          htmlFor={rowId}
          className="flex items-center gap-1.5 text-sm font-medium text-(--color-text-primary) cursor-pointer"
        >
          <span className="truncate">{ELEMENT_LABELS[elementKey]}</span>
          {hasKnobs && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400/70 flex-shrink-0"
              aria-label="Has additional settings"
              title="Has additional settings"
            />
          )}
        </label>
        <p className="text-xs text-(--color-text-muted) mt-0.5 truncate">
          {ELEMENT_DESCRIPTIONS[elementKey]}
        </p>
      </div>
      <Toggle
        id={rowId}
        checked={visible}
        onChange={onToggle}
        label={`Toggle ${ELEMENT_LABELS[elementKey]}`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SettingsRow — collapsible per-element knobs (visibility lives in grid above)
// ---------------------------------------------------------------------------

interface SettingsRowProps<K extends ElementKey> {
  elementKey: K
  config: ElementsConfig[K]
  onPatch: (patch: Partial<ElementsConfig[K]>) => void
  courtID: number
}

function SettingsRow<K extends ElementKey>({
  elementKey,
  config,
  onPatch,
  courtID,
}: SettingsRowProps<K>) {
  const [expanded, setExpanded] = useState(false)
  const rowId = `settings-${elementKey}`

  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-bg-primary)">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`${rowId}-panel`}
        className="flex w-full items-center gap-3 p-3 text-left hover:bg-(--color-bg-hover) rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
      >
        <div className="flex h-6 w-6 items-center justify-center text-(--color-text-secondary) flex-shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-(--color-text-primary)">
            {ELEMENT_LABELS[elementKey]}
          </div>
          <p className="text-xs text-(--color-text-secondary) mt-0.5 truncate">
            {settingsHint(elementKey)}
          </p>
        </div>
      </button>

      {expanded && (
        <div
          id={`${rowId}-panel`}
          className="border-t border-(--color-border) p-4"
        >
          <ElementKnobs
            elementKey={elementKey}
            config={config}
            onPatch={onPatch}
            courtID={courtID}
          />
        </div>
      )}
    </div>
  )
}

// Short descriptor shown on the collapsed settings row summarizing
// what the operator can tune.
function settingsHint(key: ElementKey): string {
  switch (key) {
    case ELEMENT_KEY.SCOREBOARD:
      return 'Layout (Classic / Banner)'
    case ELEMENT_KEY.SPONSOR_BUG:
      return 'Rotation cadence · auto-animate'
    case ELEMENT_KEY.PLAYER_CARD:
      return 'Selected player · auto-dismiss timer'
    case ELEMENT_KEY.TEAM_CARD:
      return 'Selected team · auto-dismiss timer'
    case ELEMENT_KEY.MATCH_RESULT:
      return 'Show delay · dismiss timer'
    case ELEMENT_KEY.CUSTOM_TEXT:
      return 'Text · font · colors · position · dismiss'
    default:
      // Elements without bespoke knobs still expose the universal size slider.
      return 'Size'
  }
}

// ---------------------------------------------------------------------------
// Knob renderers per element kind
// ---------------------------------------------------------------------------

// Every element now exposes at minimum a universal Size knob, so the
// settings section mirrors the visibility grid one-to-one.
function elementHasKnobs(_key: ElementKey): boolean {
  return true
}

interface KnobsProps<K extends ElementKey> {
  elementKey: K
  config: ElementsConfig[K]
  onPatch: (patch: Partial<ElementsConfig[K]>) => void
  courtID: number
}

function ElementKnobs<K extends ElementKey>({ elementKey, config, onPatch, courtID }: KnobsProps<K>) {
  // Universal Size slider wired into every element. Specific knobs (when any)
  // render above it. Elements without bespoke knobs get just the Size slider.
  // Position knob rendered here for every element EXCEPT:
  //  - lower_third: full-width banner, position is fixed by design
  //  - scoreboard: has its own inline Position field next to Layout in ScoreboardKnobs
  const specific = renderSpecificKnobs(elementKey, config, onPatch, courtID)
  const showPosition =
    elementKey !== ELEMENT_KEY.LOWER_THIRD &&
    elementKey !== ELEMENT_KEY.SCOREBOARD
  return (
    <div className="space-y-5">
      {specific}
      {showPosition && (
        <ElementPositionField
          elementKey={elementKey}
          config={config as ElementConfigBase}
          onPatch={onPatch as (p: Partial<ElementConfigBase>) => void}
        />
      )}
      <ElementSizeSlider
        elementKey={elementKey}
        config={config as ElementConfigBase}
        onPatch={onPatch as (p: Partial<ElementConfigBase>) => void}
      />
    </div>
  )
}

/**
 * Shared 9-anchor position dropdown used by every element except the
 * Scoreboard (which renders its own Position inline with Layout) and the
 * Lower Third (which is a full-width banner by design). Empty value
 * clears the config.position field so the element falls back to its
 * renderer-side default anchor.
 */
function ElementPositionField({
  elementKey,
  config,
  onPatch,
}: {
  elementKey: ElementKey
  config: ElementConfigBase
  onPatch: (p: Partial<ElementConfigBase>) => void
}) {
  const id = `pos-${elementKey}`
  const value = config.position ?? ''
  return (
    <FormField label="Position" htmlFor={id}>
      <Select
        id={id}
        value={value}
        onChange={(e) => {
          const v = e.target.value
          if (v === '') {
            onPatch({ position: undefined })
          } else {
            onPatch({ position: v as ElementPosition })
          }
        }}
      >
        <option value="">Default placement</option>
        {POSITION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <p className="text-xs text-(--color-text-secondary) mt-1">
        Anchor on the 1920×1080 canvas. Leave at default to use this
        element's conventional placement.
      </p>
    </FormField>
  )
}

/**
 * Web-safe font stack list for the Custom Text element. Every entry is a
 * full CSS font-family string so the renderer can assign it verbatim
 * without rebuilding the fallback chain. The 'system' sentinel maps to
 * the current theme's `--overlay-font-family` inside the renderer.
 */
const CUSTOM_TEXT_FONT_OPTIONS: Array<{
  value: CustomTextFont
  label: string
  group: string
}> = [
  { value: 'system', label: 'Theme default', group: 'Default' },
  { value: 'system-ui', label: 'System UI (native)', group: 'System' },
  { value: 'Arial, sans-serif', label: 'Arial', group: 'Sans-serif' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica', group: 'Sans-serif' },
  { value: '"Arial Black", Gadget, sans-serif', label: 'Arial Black', group: 'Sans-serif' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana', group: 'Sans-serif' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma', group: 'Sans-serif' },
  { value: '"Trebuchet MS", "Lucida Grande", sans-serif', label: 'Trebuchet MS', group: 'Sans-serif' },
  { value: 'Impact, Charcoal, sans-serif', label: 'Impact', group: 'Display' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman', group: 'Serif' },
  { value: 'Georgia, serif', label: 'Georgia', group: 'Serif' },
  { value: 'Garamond, "Apple Garamond", serif', label: 'Garamond', group: 'Serif' },
  { value: '"Palatino Linotype", "Book Antiqua", Palatino, serif', label: 'Palatino', group: 'Serif' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New', group: 'Monospace' },
  { value: '"Lucida Console", Monaco, monospace', label: 'Lucida Console', group: 'Monospace' },
  { value: '"Comic Sans MS", "Chalkboard SE", cursive', label: 'Comic Sans', group: 'Display' },
  { value: '"Brush Script MT", "Brush Script Std", cursive', label: 'Brush Script', group: 'Display' },
]

function renderSpecificKnobs<K extends ElementKey>(
  elementKey: K,
  config: ElementsConfig[K],
  onPatch: (p: Partial<ElementsConfig[K]>) => void,
  courtID: number,
) {
  switch (elementKey) {
    case ELEMENT_KEY.SCOREBOARD:
      return (
        <ScoreboardKnobs
          config={config as ScoreboardConfig}
          onPatch={onPatch as (p: Partial<ScoreboardConfig>) => void}
        />
      )
    case ELEMENT_KEY.SPONSOR_BUG:
      return (
        <SponsorBugKnobs
          config={config as SponsorBugConfig}
          onPatch={onPatch as (p: Partial<SponsorBugConfig>) => void}
        />
      )
    case ELEMENT_KEY.PLAYER_CARD:
      return (
        <PlayerCardKnobs
          courtID={courtID}
          config={config as PlayerCardConfig}
          onPatch={onPatch as (p: Partial<PlayerCardConfig>) => void}
        />
      )
    case ELEMENT_KEY.TEAM_CARD:
      return (
        <TeamCardKnobs
          courtID={courtID}
          config={config as TeamCardConfig}
          onPatch={onPatch as (p: Partial<TeamCardConfig>) => void}
        />
      )
    case ELEMENT_KEY.MATCH_RESULT:
      return (
        <MatchResultKnobs
          config={config as MatchResultConfig}
          onPatch={onPatch as (p: Partial<MatchResultConfig>) => void}
        />
      )
    case ELEMENT_KEY.CUSTOM_TEXT:
      return (
        <CustomTextKnobs
          config={config as CustomTextConfig}
          onPatch={onPatch as (p: Partial<CustomTextConfig>) => void}
        />
      )
    default:
      return null
  }
}

/**
 * Universal per-element size slider. Ranges 25% – 300% in 10% steps, the same
 * range everywhere, so operators don't have to relearn per element. Applied
 * as a CSS `transform: scale(N)` on each element's outer wrapper by the
 * renderer — slot footprint does not reserve extra space, so oversized
 * elements bleed past their anchor the way broadcast overlays do.
 */
function ElementSizeSlider({
  elementKey,
  config,
  onPatch,
}: {
  elementKey: ElementKey
  config: ElementConfigBase
  onPatch: (p: Partial<ElementConfigBase>) => void
}) {
  const value = config.element_scale ?? 1
  const clamped = Math.max(
    ELEMENT_SCALE_MIN,
    Math.min(ELEMENT_SCALE_MAX, Number.isFinite(value) ? value : 1),
  )
  const pct = Math.round(clamped * 100)
  const minPct = Math.round(ELEMENT_SCALE_MIN * 100)
  const maxPct = Math.round(ELEMENT_SCALE_MAX * 100)
  const stepPct = Math.round(ELEMENT_SCALE_STEP * 100)
  const id = `size-${elementKey}`
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg-secondary) p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-sm font-medium text-(--color-text-primary)"
        >
          Size
        </label>
        <span className="text-xs tabular-nums text-(--color-text-secondary)">
          {pct}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={minPct}
        max={maxPct}
        step={stepPct}
        value={pct}
        onChange={(e) => {
          const next = Number(e.target.value) / 100
          if (Number.isFinite(next)) {
            onPatch({ element_scale: next })
          }
        }}
        className="w-full accent-(--color-accent)"
        aria-label={`${ELEMENT_LABELS[elementKey]} size`}
      />
      <p className="text-xs text-(--color-text-muted)">
        Scales the whole element {minPct}%–{maxPct}%. Bleeds outside its
        anchor box — layout doesn't shift.
      </p>
    </div>
  )
}

function ScoreboardKnobs({
  config,
  onPatch,
}: {
  config: ScoreboardConfig
  onPatch: (p: Partial<ScoreboardConfig>) => void
}) {
  const current: ScoreboardLayout = config.layout ?? 'classic'
  const activeOption =
    SCOREBOARD_LAYOUT_OPTIONS.find((o) => o.value === current) ??
    SCOREBOARD_LAYOUT_OPTIONS[0]
  const defaultPosition: ElementPosition =
    current === 'banner' ? 'bottom-center' : 'bottom-left'
  const currentPosition: ElementPosition = config.position ?? defaultPosition

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Layout" htmlFor="scoreboard-layout">
          <Select
            id="scoreboard-layout"
            value={current}
            onChange={(e) =>
              onPatch({ layout: e.target.value as ScoreboardLayout })
            }
          >
            {SCOREBOARD_LAYOUT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-(--color-text-secondary) mt-1">
            {activeOption.description}
          </p>
        </FormField>
        <FormField label="Position" htmlFor="scoreboard-position">
          <Select
            id="scoreboard-position"
            value={currentPosition}
            onChange={(e) =>
              onPatch({ position: e.target.value as ElementPosition })
            }
          >
            {POSITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-(--color-text-secondary) mt-1">
            Anchor on the 1920×1080 canvas. Classic defaults to bottom-left,
            Banner defaults to bottom-center.
          </p>
        </FormField>
      </div>

      {/* Per-logo controls. Banner layout renders tournament + team logos;
          Classic renders none, so these knobs are effectively no-ops there.
          Each group has size + X + Y for fine-tuning awkward source logos. */}
      <LogoKnobGroup
        idPrefix="scoreboard-tournament-logo"
        label="Tournament logo"
        scale={config.tournament_logo_scale}
        offsetX={config.tournament_logo_offset_x}
        offsetY={config.tournament_logo_offset_y}
        onChange={(patch) => onPatch(patch)}
        scaleKey="tournament_logo_scale"
        offsetXKey="tournament_logo_offset_x"
        offsetYKey="tournament_logo_offset_y"
      />
      <LogoKnobGroup
        idPrefix="scoreboard-team-1-logo"
        label="Team 1 logo"
        scale={config.team_1_logo_scale}
        offsetX={config.team_1_logo_offset_x}
        offsetY={config.team_1_logo_offset_y}
        onChange={(patch) => onPatch(patch)}
        scaleKey="team_1_logo_scale"
        offsetXKey="team_1_logo_offset_x"
        offsetYKey="team_1_logo_offset_y"
      />
      <LogoKnobGroup
        idPrefix="scoreboard-team-2-logo"
        label="Team 2 logo"
        scale={config.team_2_logo_scale}
        offsetX={config.team_2_logo_offset_x}
        offsetY={config.team_2_logo_offset_y}
        onChange={(patch) => onPatch(patch)}
        scaleKey="team_2_logo_scale"
        offsetXKey="team_2_logo_offset_x"
        offsetYKey="team_2_logo_offset_y"
      />
      <p className="text-xs text-(--color-text-secondary)">
        Scale ranges {Math.round(SCALE_MIN * 100)}% – {Math.round(SCALE_MAX * 100)}%.
        Offset range ±{OFFSET_MAX}px. Logos are allowed to bleed outside their
        slot so awkward source art can still look clean.
      </p>
    </div>
  )
}

type LogoScaleField =
  | 'tournament_logo_scale'
  | 'team_1_logo_scale'
  | 'team_2_logo_scale'
type LogoOffsetField =
  | 'tournament_logo_offset_x'
  | 'tournament_logo_offset_y'
  | 'team_1_logo_offset_x'
  | 'team_1_logo_offset_y'
  | 'team_2_logo_offset_x'
  | 'team_2_logo_offset_y'

function LogoKnobGroup({
  idPrefix,
  label,
  scale,
  offsetX,
  offsetY,
  onChange,
  scaleKey,
  offsetXKey,
  offsetYKey,
}: {
  idPrefix: string
  label: string
  scale: number | undefined
  offsetX: number | undefined
  offsetY: number | undefined
  onChange: (patch: Partial<ScoreboardConfig>) => void
  scaleKey: LogoScaleField
  offsetXKey: LogoOffsetField
  offsetYKey: LogoOffsetField
}) {
  return (
    <div className="rounded-md border border-(--color-border) bg-(--color-bg-secondary) p-3 space-y-3">
      <div className="text-xs uppercase tracking-widest font-semibold text-(--color-text-secondary)">
        {label}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <LogoScaleSlider
          id={`${idPrefix}-scale`}
          label="Size"
          value={scale ?? 1}
          onChange={(v) =>
            onChange({ [scaleKey]: v } as Partial<ScoreboardConfig>)
          }
        />
        <LogoOffsetSlider
          id={`${idPrefix}-offset-x`}
          label="Offset X"
          value={offsetX ?? 0}
          onChange={(v) =>
            onChange({ [offsetXKey]: v } as Partial<ScoreboardConfig>)
          }
        />
        <LogoOffsetSlider
          id={`${idPrefix}-offset-y`}
          label="Offset Y"
          value={offsetY ?? 0}
          onChange={(v) =>
            onChange({ [offsetYKey]: v } as Partial<ScoreboardConfig>)
          }
        />
      </div>
    </div>
  )
}

/**
 * Range slider for the logo scale value, stepped in SCALE_STEP increments.
 * Clamps + rounds incoming values so the UI and wire contract stay coherent
 * even if a stale override drifts outside the range.
 */
function LogoScaleSlider({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const clamped = Math.max(
    SCALE_MIN,
    Math.min(SCALE_MAX, Number.isFinite(value) ? value : 1),
  )
  const pct = Math.round(clamped * 100)
  const minPct = Math.round(SCALE_MIN * 100)
  const maxPct = Math.round(SCALE_MAX * 100)
  const stepPct = Math.round(SCALE_STEP * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-sm font-medium text-(--color-text-primary)"
        >
          {label}
        </label>
        <span className="text-xs tabular-nums text-(--color-text-secondary)">
          {pct}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={minPct}
        max={maxPct}
        step={stepPct}
        value={pct}
        onChange={(e) => {
          const next = Number(e.target.value) / 100
          if (Number.isFinite(next)) onChange(next)
        }}
        className="w-full accent-(--color-accent)"
        aria-label={`${label} scale`}
      />
    </div>
  )
}

/**
 * Range slider for a logo translate offset in CSS pixels.
 * Clamps incoming values to [OFFSET_MIN, OFFSET_MAX].
 */
function LogoOffsetSlider({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const clamped = Math.max(
    OFFSET_MIN,
    Math.min(OFFSET_MAX, Number.isFinite(value) ? value : 0),
  )
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-sm font-medium text-(--color-text-primary)"
        >
          {label}
        </label>
        <span className="text-xs tabular-nums text-(--color-text-secondary)">
          {clamped > 0 ? `+${clamped}` : clamped}px
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={OFFSET_MIN}
        max={OFFSET_MAX}
        step={OFFSET_STEP}
        value={clamped}
        onChange={(e) => {
          const next = Number(e.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        className="w-full accent-(--color-accent)"
        aria-label={`${label} offset`}
      />
    </div>
  )
}

function SponsorBugKnobs({
  config,
  onPatch,
}: {
  config: SponsorBugConfig
  onPatch: (p: Partial<SponsorBugConfig>) => void
}) {
  // Use a local input value so the text cursor doesn't jump while
  // the user is typing. We forward the parsed number on change.
  const rotation = config.rotation_seconds ?? 8
  const transparent = config.transparent_background ?? false
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Rotation cadence (seconds)" htmlFor="sponsor-rotation">
          <Input
            id="sponsor-rotation"
            type="number"
            min={2}
            max={120}
            step={1}
            value={rotation}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!Number.isFinite(v) || v <= 0) return
              onPatch({ rotation_seconds: v })
            }}
          />
          <p className="text-xs text-(--color-text-secondary) mt-1">
            How often logos cross-fade. Defaults to 8s if unset.
          </p>
        </FormField>
        <FormField label="Auto-animate" htmlFor="sponsor-animate">
          <Toggle
            id="sponsor-animate"
            checked={config.auto_animate ?? true}
            onChange={(checked) => onPatch({ auto_animate: checked })}
            label="Auto-animate sponsor rotation"
          />
        </FormField>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md border border-(--color-border) bg-(--color-bg-secondary) p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-(--color-text-primary)">
            Transparent background
          </div>
          <p className="text-xs text-(--color-text-secondary) mt-0.5">
            Drop the chip surface so transparent PNG / WEBP logos composite
            directly onto the broadcast feed. Pair with logos that already
            have appropriate contrast — the broadcast background will show
            through whatever is behind.
          </p>
        </div>
        <Toggle
          id="sponsor-transparent-bg"
          checked={transparent}
          onChange={(checked) => onPatch({ transparent_background: checked })}
          label="Transparent sponsor background"
        />
      </div>
    </div>
  )
}

/**
 * PlayerCard knobs: which player to show when config.visible is true
 * (Elements-tab "always on" mode) + default auto-dismiss timer for
 * trigger-fired pops. Trigger payload.player_id still wins over config
 * when fired from the Triggers tab.
 */
function PlayerCardKnobs({
  courtID,
  config,
  onPatch,
}: {
  courtID: number
  config: PlayerCardConfig
  onPatch: (p: Partial<PlayerCardConfig>) => void
}) {
  const dataQuery = useOverlayData(courtID, {})
  const data = dataQuery.data
  const seconds = config.auto_dismiss_seconds ?? 0
  const selected = config.selected_player ?? ''

  // Build slot options with live player names when we have them.
  const options = useMemo<Array<{ value: PlayerCardSlot; label: string; disabled: boolean }>>(() => {
    const slot = (
      team: 'team_1' | 'team_2',
      idx: 0 | 1,
      slotValue: PlayerCardSlot,
      teamLabel: string,
    ): { value: PlayerCardSlot; label: string; disabled: boolean } => {
      const name = data?.[team]?.players?.[idx]?.name?.trim() ?? ''
      return {
        value: slotValue,
        label: name ? `${teamLabel} — ${name}` : `${teamLabel} — Player ${idx + 1}`,
        disabled: !name,
      }
    }
    const t1Label = data?.team_1?.name || data?.team_1?.short_name || 'Team 1'
    const t2Label = data?.team_2?.name || data?.team_2?.short_name || 'Team 2'
    return [
      slot('team_1', 0, 'team_1_player_1', t1Label),
      slot('team_1', 1, 'team_1_player_2', t1Label),
      slot('team_2', 0, 'team_2_player_1', t2Label),
      slot('team_2', 1, 'team_2_player_2', t2Label),
    ]
  }, [data])

  const allDisabled = options.every((o) => o.disabled)

  return (
    <div className="space-y-4">
      <FormField label="Selected player" htmlFor="player-card-selected">
        <Select
          id="player-card-selected"
          value={selected}
          onChange={(e) => {
            const v = e.target.value
            onPatch({ selected_player: v === '' ? undefined : (v as PlayerCardSlot) })
          }}
          disabled={allDisabled}
        >
          <option value="">Auto — current server</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
              {opt.disabled ? ' (empty slot)' : ''}
            </option>
          ))}
        </Select>
        <p className="text-xs text-(--color-text-secondary) mt-1">
          {allDisabled
            ? 'No roster — add players to each team from the team page before selecting.'
            : 'Player shown when visibility is on. Triggers tab can override with a one-off pick.'}
        </p>
      </FormField>

      <FormField label="Default dismiss" htmlFor="player-card-dismiss">
        <Select
          id="player-card-dismiss"
          value={String(seconds)}
          onChange={(e) =>
            onPatch({ auto_dismiss_seconds: parseInt(e.target.value, 10) || 0 })
          }
        >
          {DISMISS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-(--color-text-secondary) mt-1">
          Default timer when a trigger fires this card. Operators can still
          override per trigger.
        </p>
      </FormField>
    </div>
  )
}

/**
 * TeamCard knobs: which team(s) to show when config.visible is true +
 * default auto-dismiss timer. 'Both' keeps the original side-by-side
 * render. Trigger payload.team_id still wins over config when fired.
 */
function TeamCardKnobs({
  courtID,
  config,
  onPatch,
}: {
  courtID: number
  config: TeamCardConfig
  onPatch: (p: Partial<TeamCardConfig>) => void
}) {
  const dataQuery = useOverlayData(courtID, {})
  const data = dataQuery.data
  const seconds = config.auto_dismiss_seconds ?? 0
  const selected: TeamCardSelection = config.selected_team ?? 'both'

  const t1Label = data?.team_1?.name || data?.team_1?.short_name || 'Team 1'
  const t2Label = data?.team_2?.name || data?.team_2?.short_name || 'Team 2'

  return (
    <div className="space-y-4">
      <FormField label="Selected team" htmlFor="team-card-selected">
        <Select
          id="team-card-selected"
          value={selected}
          onChange={(e) =>
            onPatch({ selected_team: e.target.value as TeamCardSelection })
          }
        >
          <option value="both">Both teams side-by-side</option>
          <option value="team_1">Team 1 — {t1Label}</option>
          <option value="team_2">Team 2 — {t2Label}</option>
        </Select>
        <p className="text-xs text-(--color-text-secondary) mt-1">
          Team(s) shown when visibility is on. Triggers tab can override
          with a one-off pick.
        </p>
      </FormField>

      <FormField label="Default dismiss" htmlFor="team-card-dismiss">
        <Select
          id="team-card-dismiss"
          value={String(seconds)}
          onChange={(e) =>
            onPatch({ auto_dismiss_seconds: parseInt(e.target.value, 10) || 0 })
          }
        >
          {DISMISS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-(--color-text-secondary) mt-1">
          Default timer when a trigger fires this card. Operators can still
          override per trigger.
        </p>
      </FormField>
    </div>
  )
}

function MatchResultKnobs({
  config,
  onPatch,
}: {
  config: MatchResultConfig
  onPatch: (p: Partial<MatchResultConfig>) => void
}) {
  const show = config.auto_show_delay_seconds ?? 0
  const dismiss = config.auto_dismiss_seconds ?? 30
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Show delay (seconds)" htmlFor="mr-delay">
        <Input
          id="mr-delay"
          type="number"
          min={0}
          max={60}
          step={1}
          value={show}
          onChange={(e) =>
            onPatch({
              auto_show_delay_seconds: Math.max(0, parseInt(e.target.value, 10) || 0),
            })
          }
        />
        <p className="text-xs text-(--color-text-secondary) mt-1">
          How long after match completion to reveal the winner banner.
        </p>
      </FormField>
      <FormField label="Dismiss after (seconds)" htmlFor="mr-dismiss">
        <Input
          id="mr-dismiss"
          type="number"
          min={5}
          max={120}
          step={1}
          value={dismiss}
          onChange={(e) =>
            onPatch({
              auto_dismiss_seconds: Math.max(1, parseInt(e.target.value, 10) || 30),
            })
          }
        />
      </FormField>
    </div>
  )
}

function CustomTextKnobs({
  config,
  onPatch,
}: {
  config: CustomTextConfig
  onPatch: (p: Partial<CustomTextConfig>) => void
}) {
  const [local, setLocal] = useState(config.text ?? '')
  // Keep local in sync when upstream changes (e.g. WS pushes a new
  // value). Guard so our own typing doesn't fight the debounce.
  useEffect(() => {
    if (config.text !== local && document.activeElement?.id !== 'ct-text') {
      setLocal(config.text ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.text])

  const transparent = config.transparent_background ?? false
  const fontColor = config.font_color ?? ''
  const bgColor = config.background_color ?? ''
  const currentFont = config.font_family ?? 'system'

  return (
    <div className="space-y-4">
      <FormField label="Text" htmlFor="ct-text">
        <Input
          id="ct-text"
          placeholder="e.g. Championship Final — Court A"
          value={local}
          onChange={(e) => {
            setLocal(e.target.value)
            onPatch({ text: e.target.value })
          }}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Font" htmlFor="ct-font">
          <Select
            id="ct-font"
            value={currentFont}
            onChange={(e) => {
              const v = e.target.value
              onPatch({
                font_family: v === 'system' ? 'system' : (v as CustomTextFont),
              })
            }}
          >
            {CUSTOM_TEXT_FONT_OPTIONS.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                style={{
                  fontFamily:
                    opt.value === 'system'
                      ? 'var(--overlay-font-family)'
                      : opt.value,
                }}
              >
                {opt.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-(--color-text-secondary) mt-1">
            Web-safe stacks — every browser on every OS renders them
            natively.
          </p>
        </FormField>

        <FormField label="Auto-dismiss" htmlFor="ct-dismiss">
          <Select
            id="ct-dismiss"
            value={String(config.auto_dismiss_seconds ?? 0)}
            onChange={(e) =>
              onPatch({ auto_dismiss_seconds: parseInt(e.target.value, 10) || 0 })
            }
          >
            {DISMISS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Font color" htmlFor="ct-font-color">
          <ColorPickerField
            id="ct-font-color"
            value={fontColor}
            placeholder="Theme default"
            onChange={(v) => onPatch({ font_color: v || undefined })}
          />
        </FormField>

        <FormField label="Background color" htmlFor="ct-bg-color">
          <ColorPickerField
            id="ct-bg-color"
            value={bgColor}
            placeholder="Theme default"
            disabled={transparent}
            onChange={(v) => onPatch({ background_color: v || undefined })}
          />
          {transparent && (
            <p className="text-xs text-(--color-text-secondary) mt-1">
              Background color ignored while transparent.
            </p>
          )}
        </FormField>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md border border-(--color-border) bg-(--color-bg-secondary) p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-(--color-text-primary)">
            Transparent background
          </div>
          <p className="text-xs text-(--color-text-secondary) mt-0.5">
            Drop the chip surface so the text composites directly onto the
            broadcast. Pair with a font color that has enough contrast
            against whatever's behind the overlay.
          </p>
        </div>
        <Toggle
          id="ct-transparent-bg"
          checked={transparent}
          onChange={(checked) => onPatch({ transparent_background: checked })}
          label="Transparent custom text background"
        />
      </div>
    </div>
  )
}

/**
 * Native color picker + hex text input pair. Empty string = clear (fall
 * back to theme default). Handles #rrggbb only — the native color input
 * emits long-form hex so we accept that format and leave validation to
 * the browser.
 */
function ColorPickerField({
  id,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  id: string
  value: string
  placeholder?: string
  disabled?: boolean
  onChange: (next: string) => void
}) {
  // The <input type="color"> element can't hold an empty value, so we
  // keep the picker mirrored to the text value when it looks like a hex
  // string and fall back to black otherwise. The paired text input is
  // the source of truth for "unset".
  const looksHex = /^#[0-9a-fA-F]{6}$/.test(value)
  return (
    <div className="flex items-center gap-2">
      <input
        id={`${id}-picker`}
        type="color"
        aria-label="Color swatch"
        disabled={disabled}
        value={looksHex ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 w-12 shrink-0 rounded-md border border-(--color-border) bg-(--color-bg-input) p-1 cursor-pointer',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      />
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.trim())}
        className="flex-1"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

function Toggle({
  id,
  checked,
  onChange,
  label,
}: {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2',
        checked ? 'bg-cyan-500' : 'bg-(--color-bg-hover)',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

// Smoke 13.3 / 16.4: render the saving indicator as a fixed-position
// floating pill so it doesn't push the tab content down on every
// checkbox toggle (autosave debounce fires constantly while operators
// are editing). The pill sits bottom-right where toasts also appear,
// matching the rest of the app's notification language.
function SaveIndicator({ pending }: { pending: boolean }) {
  if (!pending) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-bg-secondary) px-3 py-1.5 text-xs text-(--color-text-secondary) shadow-lg"
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      Saving…
    </div>
  )
}
