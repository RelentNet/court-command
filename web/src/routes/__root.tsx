import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Sidebar } from '../components/Sidebar'
import { PublicTopBar } from '../components/PublicTopBar'
import { PublicBottomTabs } from '../components/PublicBottomTabs'
import { ImpersonationBanner } from '../components/ImpersonationBanner'
import { AuthGuard } from '../features/auth/AuthGuard'
// TEMP-ADMIN-BYPASS: banner is mounted in both authenticated layouts
// (AuthenticatedLayout below, and PublicLayout's authenticated branch).
// Tied to the ADMIN_BYPASS_ACTIVE constant in features/admin/bypass.ts.
import { AdminBypassBanner } from '../features/admin/AdminBypassBanner'
import { useAuth } from '../auth/useAuth'
import { SportProvider } from '../auth/SportContext'
import { SearchModalMount } from '../features/search/SearchContext'
import { cn } from '../lib/cn'
import { useIsMobile } from '../hooks/useMediaQuery'
import { useState, useEffect } from 'react'

const NO_SHELL_ROUTES = ['/auth/callback']

// Public routes: do not require auth. If a user is logged in, they get the
// shell; otherwise the page renders without sidebar/header chrome.
//
// After Phase 3 the sport-scoped match routes live at /$sport/matches/<id> —
// the regex `^\/[^/]+\/matches\/[^/]+$` matches that shape. The first segment
// is any sport slug (pickleball, demo_sport, etc.).
const PUBLIC_ROUTE_PATTERNS: RegExp[] = [
  /^\/$/,                              // sport picker (Task 6)
  /^\/auth\//,                         // OIDC callback (Task 7)
  /^\/public(\/|$)/,
  /^\/[^/]+\/matches\/[^/]+$/,         // /$sport/matches/$publicId is public
  /^\/[^/]+\/match-series\/[^/]+$/,    // /$sport/match-series/$publicId
  /^\/live$/,
  /^\/events$/,
]

// Routes that always render with no shell at all (no sidebar, no auth).
// Used for embed/OBS targets and pre-auth pages.
const NO_SHELL_PATTERNS: RegExp[] = [
  /^\/[^/]+\/matches\/[^/]+\/scoreboard$/,    // /$sport/matches/.../scoreboard
  // Phase 4 broadcast overlay — renders inside OBS browser source
  /^\/overlay\/court\/[^/]+$/,
  /^\/overlay\/demo\/[^/]+$/,
  // Phase 4 TV/Kiosk — fullscreen venue displays
  /^\/tv\/tournaments\/[^/]+$/,
  /^\/tv\/courts\/[^/]+$/,
]

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-(--color-text-primary) mb-2">404</h1>
        <p className="text-(--color-text-secondary)">Page not found</p>
      </div>
    </main>
  ),
})

function RootLayout() {
  // SportProvider wraps the entire tree so the Sidebar (rendered by
  // AuthenticatedLayout / PublicLayout below) sees the current sport
  // via useSport(). The provider derives the slug from useLocation()
  // — must be called inside <RouterProvider>, which RootLayout already is.
  //
  // SearchModalMount is rendered here (inside RouterProvider) so the
  // search results' <Link> children have a valid router context.
  // SearchProvider in App.tsx only owns state; it lives outside
  // RouterProvider so app-shell components can call openSearch().
  return (
    <SportProvider>
      <RootLayoutInner />
      <SearchModalMount />
    </SportProvider>
  )
}

function RootLayoutInner() {
  const location = useLocation()
  const pathname = location.pathname
  const isNoShell =
    NO_SHELL_ROUTES.includes(pathname) ||
    NO_SHELL_PATTERNS.some((p) => p.test(pathname))
  const isPublic = PUBLIC_ROUTE_PATTERNS.some((p) => p.test(pathname))

  if (isNoShell) {
    return <ErrorBoundary><Outlet /></ErrorBoundary>
  }

  if (isPublic) {
    return <ErrorBoundary><PublicLayout /></ErrorBoundary>
  }

  return <ErrorBoundary><AuthGuard><AuthenticatedLayout /></AuthGuard></ErrorBoundary>
}

function AuthenticatedLayout() {
  const { user, signOut } = useAuth()
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('cc_sidebar_expanded') === 'true'
  })

  useEffect(() => {
    const handler = () => setExpanded(localStorage.getItem('cc_sidebar_expanded') === 'true')
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const { isImpersonating } = useAuth()
  if (!user) return null

  return (
    <>
      {/* TEMP-ADMIN-BYPASS: banner mounts above all other chrome so it's
          visible the moment the authenticated shell renders. The banner
          self-hides when ADMIN_BYPASS_ACTIVE in features/admin/bypass.ts
          is false. */}
      <AdminBypassBanner visible />
      <ImpersonationBanner />
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <Sidebar user={user} onLogout={() => signOut('/')} />
      <main
        id="main-content"
        className={cn(
          'min-h-screen transition-[margin] duration-200 ease-in-out',
          isImpersonating ? 'pt-10' : '',
          // Mobile: top header (h-14) + bottom tabs (h-14). Reserve
          // space at both ends so content isn't hidden under either.
          isMobile ? 'pt-14 pb-16' : expanded ? 'ml-[220px]' : 'ml-14',
        )}
      >
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
      {/* Smoke 16.3: bottom tab bar for authenticated mobile users.
          Sidebar already collapses to a top header on mobile; without
          these tabs, navigation requires opening the drawer for every
          jump. */}
      {isMobile && <PublicBottomTabs />}
    </>
  )
}

/**
 * Layout for routes that work for both anonymous and authenticated users.
 * Authenticated users get the full sidebar. Anonymous users get a minimal
 * top bar + bottom tab bar (mobile-app style navigation).
 */
function PublicLayout() {
  const { user, isLoading, signOut } = useAuth()
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('cc_sidebar_expanded') === 'true'
  })

  useEffect(() => {
    const handler = () => setExpanded(localStorage.getItem('cc_sidebar_expanded') === 'true')
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Authenticated users get the regular sidebar experience
  if (!isLoading && user) {
    return (
      <>
        {/* TEMP-ADMIN-BYPASS: same as AuthenticatedLayout -- show the
            banner on every authenticated page so signed-in visitors on
            public routes see the warning too. */}
        <AdminBypassBanner visible />
        <ImpersonationBanner />
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <Sidebar
          user={user}
          onLogout={() => signOut('/')}
        />
        <main
          id="main-content"
          className={cn(
            'min-h-screen transition-[margin] duration-200 ease-in-out',
            isMobile ? 'pt-14 pb-16' : expanded ? 'ml-[220px]' : 'ml-14',
          )}
        >
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
        {isMobile && <PublicBottomTabs />}
      </>
    )
  }

  // Anonymous users: top bar + bottom tabs (mobile-app style)
  return (
    <>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <PublicTopBar />
      <main id="main-content" className="min-h-screen pt-14 pb-16">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
      {isMobile && <PublicBottomTabs />}
    </>
  )
}
