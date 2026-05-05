// web/src/features/overlay/controls/ThemeTab.tsx
//
// Control Panel: Theme tab.
//
// Two-part UI:
//   1. Theme gallery — choose one of the 6 built-in overlay themes
//      (fetched via useThemes → GET /api/v1/overlay/themes).
//   2. Color overrides — fine-tune primary/secondary/accent hex values
//      on top of the selected theme. Overrides are stored as a
//      ColorOverrides object alongside the theme_id.
//
// All writes go through PUT /api/v1/overlay/court/{id}/config/theme.
// Color picker changes are debounced 300ms so dragging the hue slider
// doesn't spam the API.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { useToast } from '../../../components/Toast'
import { cn } from '../../../lib/cn'
import type { ColorOverrides, CourtOverlayConfig, Theme } from '../types'
import { useThemes, useUpdateTheme } from '../hooks'

// Debounce window for native <input type="color"> changes.
const COLOR_DEBOUNCE_MS = 300

interface ThemeTabProps {
  courtID: number
  config: CourtOverlayConfig | undefined
  loading: boolean
}

export function ThemeTab({ courtID, config, loading }: ThemeTabProps) {
  const { toast } = useToast()
  const themesQuery = useThemes()
  const updateTheme = useUpdateTheme(courtID)

  const [overrides, setOverrides] = useState<ColorOverrides>({})
  const flushTimer = useRef<number | null>(null)
  const pendingOverridesRef = useRef<ColorOverrides | null>(null)
  const pendingThemeIdRef = useRef<string | null>(null)

  // Hydrate local state when config loads.
  useEffect(() => {
    if (config?.color_overrides) {
      setOverrides(config.color_overrides)
    }
  }, [config?.color_overrides])

  // Cleanup pending debounce on unmount.
  useEffect(() => () => {
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
  }, [])

  function commitWithDebounce(nextTheme: string, nextOverrides: ColorOverrides) {
    pendingThemeIdRef.current = nextTheme
    pendingOverridesRef.current = nextOverrides
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => flush(), COLOR_DEBOUNCE_MS)
  }

  function flush() {
    const themeID = pendingThemeIdRef.current ?? config?.theme_id
    const pendingOverrides = pendingOverridesRef.current ?? overrides
    if (!themeID) return
    updateTheme.mutate(
      { theme_id: themeID, color_overrides: pendingOverrides },
      {
        onError: (err) => {
          toast('error', err.message || 'Could not save theme')
        },
      },
    )
  }

  function selectTheme(themeID: string) {
    // Theme changes flush immediately (no debounce) for instant feedback.
    pendingThemeIdRef.current = themeID
    if (flushTimer.current) {
      window.clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    updateTheme.mutate(
      { theme_id: themeID, color_overrides: overrides },
      {
        onError: (err) => {
          toast('error', err.message || 'Could not switch theme')
        },
      },
    )
  }

  function setOverride(key: keyof ColorOverrides, value: string | undefined) {
    const next = { ...overrides }
    if (!value) delete next[key]
    else next[key] = value
    setOverrides(next)
    commitWithDebounce(config?.theme_id ?? 'classic', next)
  }

  function resetOverrides() {
    setOverrides({})
    pendingOverridesRef.current = {}
    pendingThemeIdRef.current = config?.theme_id ?? 'classic'
    if (flushTimer.current) {
      window.clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    updateTheme.mutate(
      { theme_id: config?.theme_id ?? 'classic', color_overrides: {} },
      {
        onSuccess: () => {
          toast('success', 'Reset to theme defaults')
        },
        onError: (err) => {
          toast('error', err.message || 'Could not reset colors')
        },
      },
    )
  }

  const activeThemeId = config?.theme_id ?? 'classic'
  const activeTheme = useMemo(
    () => themesQuery.data?.find((t) => t.id === activeThemeId) ?? null,
    [themesQuery.data, activeThemeId],
  )

  if (loading || !config) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-(--color-text-secondary)">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading theme…</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-(--color-text-primary) uppercase tracking-wider">
              Theme
            </h2>
            <p className="text-xs text-(--color-text-secondary) mt-0.5">
              The base palette + typography + animation style. Custom
              overrides below layer on top.
            </p>
          </div>
          {updateTheme.isPending && <SavingPill />}
        </div>

        {themesQuery.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-(--color-text-secondary)">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading themes…</span>
          </div>
        ) : themesQuery.isError ? (
          <p className="text-sm text-red-500" role="alert">
            Could not load themes. Try reloading.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {themesQuery.data?.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                selected={theme.id === activeThemeId}
                onSelect={() => selectTheme(theme.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-(--color-text-primary) uppercase tracking-wider">
              Custom colors
            </h2>
            <p className="text-xs text-(--color-text-secondary) mt-0.5">
              Override primary, secondary, and accent. Empty fields fall
              back to theme defaults.
            </p>
          </div>
          {Object.keys(overrides).length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetOverrides}
              aria-label="Reset color overrides"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <ColorOverrideInput
            label="Primary"
            value={overrides.primary}
            fallback={activeTheme?.defaults.primary}
            onChange={(v) => setOverride('primary', v)}
          />
          <ColorOverrideInput
            label="Secondary"
            value={overrides.secondary}
            fallback={activeTheme?.defaults.secondary}
            onChange={(v) => setOverride('secondary', v)}
          />
          <ColorOverrideInput
            label="Accent"
            value={overrides.accent}
            fallback={activeTheme?.defaults.accent}
            onChange={(v) => setOverride('accent', v)}
          />
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Theme gallery card
// ---------------------------------------------------------------------------

function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: Theme
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'group relative flex flex-col text-left rounded-lg border-2 transition-all overflow-hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400',
        selected
          ? 'border-cyan-500 shadow-md'
          : 'border-(--color-border) hover:border-(--color-text-muted)',
      )}
    >
      {/* Color sample strip */}
      <div
        className="h-16 w-full flex"
        style={{ backgroundColor: theme.defaults.background }}
      >
        <div className="flex-1" style={{ backgroundColor: theme.defaults.primary }} />
        <div className="flex-1" style={{ backgroundColor: theme.defaults.secondary }} />
        <div className="flex-1" style={{ backgroundColor: theme.defaults.accent }} />
      </div>
      <div className="flex-1 p-3 bg-(--color-bg-secondary)">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-(--color-text-primary)">
            {theme.name}
          </h3>
          {selected && (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-white"
              aria-hidden="true"
            >
              <Check className="h-3 w-3" />
            </span>
          )}
        </div>
        <p className="text-xs text-(--color-text-secondary) mt-1 line-clamp-2">
          {theme.description}
        </p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Color override input
// ---------------------------------------------------------------------------

function ColorOverrideInput({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string | undefined
  fallback: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const effective = value ?? fallback ?? '#000000'
  // The <input type="color"> value must be a valid 7-char #RRGGBB.
  // We tolerate any user-entered string (including empty) for the text
  // field but normalize for the picker.
  const pickerValue = /^#[0-9a-f]{6}$/i.test(effective) ? effective : '#000000'
  const id = `color-${label.toLowerCase()}`
  return (
    <FormField label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded border border-(--color-border) bg-(--color-bg-input)"
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          value={value ?? ''}
          placeholder={fallback ?? '—'}
          onChange={(e) => onChange(e.target.value.trim() || undefined)}
          className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg-input) px-3 py-2 text-sm font-mono text-(--color-text-primary) focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
          aria-label={`${label} hex value`}
        />
      </div>
      {value === undefined && fallback && (
        <p className="text-xs text-(--color-text-secondary) mt-1">
          Using theme default{' '}
          <span className="font-mono text-(--color-text-primary)">{fallback}</span>
        </p>
      )}
    </FormField>
  )
}

// Smoke 13.3 / 16.4: fixed-position pill so the saving indicator
// doesn't push tab content down on autosave. Mirrors the style used
// in ElementsTab; same bottom-right anchor as the toast stack.
function SavingPill() {
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
