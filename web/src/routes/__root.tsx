import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Sidebar } from '../components/Sidebar'
import { PublicTopBar } from '../components/PublicTopBar'
import { PublicBottomTabs } from '../components/PublicBottomTabs'
import { ImpersonationBanner } from '../components/ImpersonationBanner'
import { AuthGuard } from '../features/auth/AuthGuard'
import { useAuth } from '../auth/useAuth'
import { cn } from '../lib/cn'
import { useIsMobile } from '../hooks/useMediaQuery'
import { useState, useEffect } from 'react'

const NO_SHELL_ROUTES = ['/login', '/register', '/auth/callback']

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
      <ImpersonationBanner />
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <Sidebar user={user} onLogout={() => signOut('/')} />
      <main id="main-content" className={cn('min-h-screen transition-[margin] duration-200 ease-in-out', isImpersonating ? 'pt-10' : '', isMobile ? 'pt-14' : expanded ? 'ml-[220px]' : 'ml-14')}>
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
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
        <ImpersonationBanner />
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <Sidebar
          user={user}
          onLogout={() => signOut('/')}
        />
        <main id="main-content" className={cn('min-h-screen transition-[margin] duration-200 ease-in-out', isMobile ? 'pt-14' : expanded ? 'ml-[220px]' : 'ml-14')}>
          <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
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
      <PublicBottomTabs />
    </>
  )
}
