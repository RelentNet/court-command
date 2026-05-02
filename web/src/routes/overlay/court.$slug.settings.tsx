// web/src/routes/overlay/court.$slug.settings.tsx
//
// Overlay Control Panel — broadcast operator surface for tuning the
// per-court overlay at /overlay/court/$slug/settings.
//
// Layout (responsive + operator-overridable):
//   • Auto (default): side-by-side on lg+ screens, sticky-top stacked below
//   • Top: force sticky-top layout even on wide screens
//   • Side: force side-by-side (preview left, tabs right) — lg+ only
//
// In side mode, the preview column is position:sticky so it never leaves
// the operator's view while they scroll the (taller) tabs column on the
// right. In top mode, the entire preview + tabs share vertical scroll,
// matching the original Phase 4C layout. SessionStorage persists the
// choice per-court.
//
// Auth gate: only operator-class roles get in. Backend currently only
// accepts 'player' and 'platform_admin' via CHECK constraint (migration
// 00030 expanded the schema but the constraint is sticky), so in
// practice this page is reachable by platform_admin + any elevated
// role once the constraint is relaxed.

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Columns2,
  ExternalLink,
  Eye,
  LayoutPanelTop,
  Loader2,
  Lock,
  Sparkles,
  SquareSplitHorizontal,
  X,
} from 'lucide-react'
import { Button } from '../../components/Button'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { TabLayout } from '../../components/TabLayout'
import { useAuth } from '../../auth/useAuth'
import { ElementsTab } from '../../features/overlay/controls/ElementsTab'
import { ObsUrlTab } from '../../features/overlay/controls/ObsUrlTab'
import { OverridesTab } from '../../features/overlay/controls/OverridesTab'
import { SourceTab } from '../../features/overlay/controls/SourceTab'
import { ThemeTab } from '../../features/overlay/controls/ThemeTab'
import { TriggersTab } from '../../features/overlay/controls/TriggersTab'
import { PreviewPane } from '../../features/overlay/PreviewPane'
import type { CourtOverlayConfig } from '../../features/overlay/types'
import {
  useOverlayConfig,
  useOverlayDataBySlug,
} from '../../features/overlay/hooks'

// Operator-class roles allowed to configure overlays. Kept at module
// scope so it isn't rebuilt on every render. Mirror any backend change
// here — this is a UI gate, not an authorization boundary.
const ROLE_ALLOWLIST: ReadonlySet<string> = new Set([
  'broadcast_operator',
  'tournament_director',
  'head_referee',
  'platform_admin',
])

type TabId =
  | 'elements'
  | 'theme'
  | 'source'
  | 'triggers'
  | 'overrides'
  | 'obs_url'

type LayoutMode = 'auto' | 'top' | 'side'

const LAYOUT_MODE_VALUES: readonly LayoutMode[] = ['auto', 'top', 'side']

export const Route = createFileRoute('/overlay/court/$slug/settings')({
  component: OverlaySettingsRoute,
})

function OverlaySettingsRoute() {
  return (
    <ErrorBoundary>
      <OverlaySettingsPage />
    </ErrorBoundary>
  )
}

function OverlaySettingsPage() {
  const { slug } = Route.useParams()
  const navigate = useNavigate()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('elements')

  // Resolve slug → courtID so downstream mutation hooks can target the
  // right court. We intentionally render the preview pane regardless of
  // whether the config query has resolved; the renderer itself is
  // silent-by-default during loading states.
  const { courtID, courtsQuery } = useOverlayDataBySlug(slug, {})
  const configQuery = useOverlayConfig(courtID)

  const tabs = useMemo<Array<{ id: TabId; label: string }>>(
    () => [
      { id: 'elements', label: 'Elements' },
      { id: 'theme', label: 'Theme' },
      { id: 'source', label: 'Source' },
      { id: 'triggers', label: 'Triggers' },
      { id: 'overrides', label: 'Overrides' },
      { id: 'obs_url', label: 'OBS URL' },
    ],
    [],
  )

  // Auth gate — render a localized access denied card rather than
  // redirecting, so operators see why they can't get in.
  if (authLoading) {
    return <FullPageSpinner label="Checking access…" />
  }
  if (!isAuthenticated || !user) {
    // Not logged in — send to login and bounce back.
    navigate({
      to: '/login',
      search: { redirect: `/overlay/court/${slug}/settings` },
    })
    return null
  }
  if (!ROLE_ALLOWLIST.has(user.role)) {
    return <AccessDeniedCard role={user.role} slug={slug} />
  }

  // Court resolution — if the slug doesn't match any known court,
  // show a specific "not found" state so the operator can fix the URL
  // rather than staring at a blank preview.
  if (courtsQuery.isLoading) {
    return <FullPageSpinner label="Loading court…" />
  }
  if (courtsQuery.isError) {
    return (
      <ErrorCard
        title="Could not resolve court"
        message="We couldn't look up this court. Check your connection and try again."
      />
    )
  }
  if (courtID === null) {
    return (
      <ErrorCard
        title="Court not found"
        message={`No court matches the slug “${slug}”. Check the URL or create this court from the Venues page.`}
      />
    )
  }

  const config = configQuery.data

  return (
    <OverlaySettingsLayout
      slug={slug}
      courtID={courtID}
      config={config}
      configLoading={configQuery.isLoading}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    />
  )
}

// ---------------------------------------------------------------------------
// Layout shell — owns the layout-mode toggle and composes header + body
// ---------------------------------------------------------------------------

interface OverlaySettingsLayoutProps {
  slug: string
  courtID: number
  config: CourtOverlayConfig | undefined
  configLoading: boolean
  tabs: Array<{ id: TabId; label: string }>
  activeTab: TabId
  onTabChange: (id: TabId) => void
}

function OverlaySettingsLayout({
  slug,
  courtID,
  config,
  configLoading,
  tabs,
  activeTab,
  onTabChange,
}: OverlaySettingsLayoutProps) {
  const [layoutMode, setLayoutMode] = useLayoutMode(courtID)

  // Compose the tabs panel once so both layout branches can reuse it
  // without duplicating every tab's prop plumbing.
  const tabsPanel = (
    <section aria-label="Overlay configuration">
      <TabLayout
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(id) => onTabChange(id as TabId)}
      >
        {activeTab === 'elements' && (
          <ElementsTab courtID={courtID} config={config} loading={configLoading} />
        )}
        {activeTab === 'theme' && (
          <ThemeTab courtID={courtID} config={config} loading={configLoading} />
        )}
        {activeTab === 'source' && (
          <SourceTab courtID={courtID} config={config} loading={configLoading} />
        )}
        {activeTab === 'triggers' && <TriggersTab courtID={courtID} />}
        {activeTab === 'overrides' && (
          <OverridesTab courtID={courtID} config={config} loading={configLoading} />
        )}
        {activeTab === 'obs_url' && (
          <ObsUrlTab slug={slug} courtID={courtID} config={config} loading={configLoading} />
        )}
      </TabLayout>
    </section>
  )

  const previewSection = <PreviewSection slug={slug} courtID={courtID} />

  // The responsive class string. 'auto' lets Tailwind's lg: prefix
  // decide; 'top' forces stacked; 'side' forces grid at all widths.
  //
  // Why `min-h-0` on grid children: sticky positioning inside a grid
  // column needs the parent grid to NOT constrain its children's
  // intrinsic height. Without min-h-0 the tabs column can refuse to
  // scroll. This is the classic "flexbox/grid scroll" gotcha.
  const bodyGridClass =
    layoutMode === 'side'
      ? 'grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-3 items-start'
      : layoutMode === 'top'
        ? 'flex flex-col gap-2'
        : 'flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,40%)_minmax(0,1fr)] lg:gap-3 lg:items-start'

  // Top mode: the preview is a sticky block above the tabs. In a
  // normal document flow (not grid/flex), `position: sticky top-2`
  // makes the element stick near the top of the viewport as the user
  // scrolls, then releases when its parent scrolls past. We also
  // bump z-index so the sticky preview stays above tab content.
  const previewColumnClass =
    layoutMode === 'side'
      ? 'sticky top-2 self-start'
      : layoutMode === 'top'
        ? 'sticky top-2 z-10 bg-(--color-bg-primary)'
        : 'lg:sticky lg:top-2 lg:self-start'

  return (
    <div className="space-y-2">
      <Header
        slug={slug}
        courtID={courtID}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
      />

      <FirstRunBanner courtID={courtID} config={config} />

      <div className={bodyGridClass}>
        <div className={previewColumnClass}>{previewSection}</div>
        <div className="min-w-0">{tabsPanel}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout mode hook — sessionStorage-backed per court
// ---------------------------------------------------------------------------

function useLayoutMode(
  courtID: number,
): [LayoutMode, (next: LayoutMode) => void] {
  const storageKey = `cc:overlay:layout-mode:${courtID}`

  const [mode, setMode] = useState<LayoutMode>(() => {
    if (typeof window === 'undefined') return 'auto'
    try {
      const stored = window.sessionStorage.getItem(storageKey)
      if (stored && (LAYOUT_MODE_VALUES as readonly string[]).includes(stored)) {
        return stored as LayoutMode
      }
    } catch {
      // sessionStorage unavailable (private mode) — use default
    }
    return 'auto'
  })

  const update = (next: LayoutMode) => {
    setMode(next)
    try {
      window.sessionStorage.setItem(storageKey, next)
    } catch {
      // ignore storage failures — in-memory state still applies
    }
  }

  return [mode, update]
}

// ---------------------------------------------------------------------------
// Header — single-line summary + layout toggle + OBS view link
// ---------------------------------------------------------------------------

function Header({
  slug,
  courtID,
  layoutMode,
  onLayoutModeChange,
}: {
  slug: string
  courtID: number
  layoutMode: LayoutMode
  onLayoutModeChange: (next: LayoutMode) => void
}) {
  return (
    <header className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-baseline gap-2 min-w-0">
        <h1 className="text-sm font-semibold text-(--color-text-primary) truncate">
          {slug}
        </h1>
        <span className="text-[10px] uppercase tracking-wider text-(--color-text-muted) shrink-0">
          Court #{courtID}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <LayoutModeToggle value={layoutMode} onChange={onLayoutModeChange} />
        <Link
          to="/overlay/court/$slug"
          params={{ slug }}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) px-2 py-1 rounded-md border border-(--color-border) hover:bg-(--color-bg-hover)"
        >
          Open OBS view <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Layout mode toggle — 3-state pill group (Auto / Top / Side)
// ---------------------------------------------------------------------------

interface LayoutModeOption {
  value: LayoutMode
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  description: string
}

const LAYOUT_MODE_OPTIONS: readonly LayoutModeOption[] = [
  {
    value: 'auto',
    label: 'Auto',
    icon: SquareSplitHorizontal,
    description: 'Side-by-side on wide screens, stacked on narrow',
  },
  {
    value: 'top',
    label: 'Top',
    icon: LayoutPanelTop,
    description: 'Preview pinned to the top of the page',
  },
  {
    value: 'side',
    label: 'Side',
    icon: Columns2,
    description: 'Preview pinned to the left, tabs scroll on the right',
  },
]

function LayoutModeToggle({
  value,
  onChange,
}: {
  value: LayoutMode
  onChange: (next: LayoutMode) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Layout mode"
      className="inline-flex rounded-md border border-(--color-border) overflow-hidden bg-(--color-bg-secondary)"
    >
      {LAYOUT_MODE_OPTIONS.map((option) => {
        const Icon = option.icon
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${option.label} layout — ${option.description}`}
            title={option.description}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) ${
              selected
                ? 'bg-(--color-accent) text-(--color-bg-primary)'
                : 'text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary)'
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden={true} />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview section — collapsible live overlay preview
//
// Bordered container with a header strip (Show/Hide toggle) and a
// height-capped body that hosts PreviewPane. The preview itself uses
// OverlayRenderer with fullscreen={false}, and PreviewPane applies
// transform:scale to a 1920×1080 canvas — the transform establishes
// a new containing block so fixed-positioned overlay elements stay
// inside the preview instead of leaking to the viewport.
//
// Collapse state persists per-court in sessionStorage so an operator's
// preference survives reloads without bleeding across courts.
// ---------------------------------------------------------------------------

function PreviewSection({ slug, courtID }: { slug: string; courtID: number }) {
  const storageKey = `cc:overlay:preview-collapsed:${courtID}`
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(storageKey)
      if (stored === '1') setCollapsed(true)
    } catch {
      // sessionStorage unavailable — stay expanded.
    }
  }, [storageKey])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.sessionStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      // ignore storage failures — in-memory state still applies
    }
  }

  const regionId = `overlay-preview-${courtID}`

  return (
    <section
      aria-label="Live overlay preview"
      className="rounded-lg border border-(--color-border) overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-(--color-bg-secondary) border-b border-(--color-border)">
        <div className="flex items-center gap-1.5 text-xs text-(--color-text-secondary) min-w-0">
          <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="font-medium text-(--color-text-primary)">
            Live preview
          </span>
          <span className="text-[10px] text-(--color-text-muted) hidden sm:inline truncate">
            · 1920×1080 · synced with OBS
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={regionId}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
        >
          {collapsed ? (
            <>
              Show <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          ) : (
            <>
              Hide <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
      {!collapsed && (
        <div
          id={regionId}
          style={{ height: 'min(42vh, 440px)', minHeight: 240 }}
        >
          <PreviewPane slug={slug} className="h-full" />
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// First-run banner
//
// Nudges operators who land on a fresh court toward the setup wizard so
// they don't stare at a dead preview pane wondering what to do next.
// The "fresh" detection is intentionally conservative: no theme_id, or
// zero visible element toggles. Dismissal persists per-court in
// sessionStorage so the banner does not nag during the same session.
// ---------------------------------------------------------------------------

function FirstRunBanner({
  courtID,
  config,
}: {
  courtID: number
  config: CourtOverlayConfig | undefined
}) {
  const storageKey = `cc:overlay:first-run-dismissed:${courtID}`
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(storageKey)
      if (stored === '1') setDismissed(true)
    } catch {
      // sessionStorage unavailable (private mode) — banner stays visible.
    }
  }, [storageKey])

  if (dismissed) return null
  if (!config) return null

  const hasTheme = typeof config.theme_id === 'string' && config.theme_id.length > 0
  const visibleCount = Object.values(config.elements ?? {}).filter(
    (el) => el && typeof el === 'object' && (el as { visible?: boolean }).visible === true,
  ).length
  const needsSetup = !hasTheme || visibleCount === 0
  if (!needsSetup) return null

  const handleDismiss = () => {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // ignore storage failures — state dismissal still holds for this render
    }
  }

  return (
    <section
      role="region"
      aria-label="Overlay setup suggestion"
      className="flex items-start justify-between gap-4 rounded-lg border border-(--color-accent) bg-(--color-accent)/10 p-4"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="h-5 w-5 shrink-0 text-(--color-accent) mt-0.5" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-(--color-text-primary)">
            Overlay not configured yet
          </h2>
          <p className="mt-0.5 text-sm text-(--color-text-secondary)">
            This court has no theme or visible elements selected. Run the
            setup wizard to get on-air in three steps.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link to="/overlay/setup">
          <Button size="sm">Open setup wizard</Button>
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss setup suggestion"
          className="rounded p-1 text-(--color-text-muted) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Shared states
// ---------------------------------------------------------------------------

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex items-center gap-3 text-(--color-text-secondary)">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  )
}

function AccessDeniedCard({ role, slug }: { role: string; slug: string }) {
  return (
    <div className="mx-auto max-w-lg mt-12 rounded-lg border border-(--color-border) p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-(--color-bg-hover)">
        <Lock className="h-6 w-6 text-(--color-text-secondary)" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold text-(--color-text-primary)">
        Operator access required
      </h1>
      <p className="mt-2 text-sm text-(--color-text-secondary)">
        Configuring the broadcast overlay requires an operator-class role
        (Tournament Director, Head Referee, Broadcast Operator, or Platform
        Admin). Your current role is{' '}
        <span className="font-mono text-(--color-text-primary)">{role}</span>.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link
          to="/overlay/court/$slug"
          params={{ slug }}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary">View overlay (read-only)</Button>
        </Link>
      </div>
    </div>
  )
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-lg mt-12 rounded-lg border border-(--color-border) p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
        <AlertCircle className="h-6 w-6 text-red-500" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold text-(--color-text-primary)">{title}</h1>
      <p className="mt-2 text-sm text-(--color-text-secondary)">{message}</p>
    </div>
  )
}
