import { useState, useEffect } from 'react'
import { Link, useMatchRoute, useLocation } from '@tanstack/react-router'
import { cn } from '../lib/cn'
import { useIsMobile } from '../hooks/useMediaQuery'
import { ThemeToggle } from './ThemeToggle'
import { Avatar } from './Avatar'
import {
  LayoutDashboard, Trophy, Medal, MapPin, Users, UsersRound, Building2, Tv, Menu, ChevronLeft, LogOut,
  Gavel, ClipboardList, Zap, Search, LogIn, Shield, Home, FolderKanban, Newspaper, Repeat,
} from 'lucide-react'
import { useSearchModal } from '../features/search/SearchContext'
import { useSport } from '../auth/SportContext'
import { useAuth } from '../auth/useAuth'

interface SidebarUser {
  first_name: string
  last_name: string
  public_id: string
  display_name?: string | null
  role?: string
}

interface SidebarProps {
  user?: SidebarUser | null
  onLogout?: () => void
}

const STORAGE_KEY = 'cc_sidebar_expanded'

interface NavItem { label: string; icon: typeof LayoutDashboard; path: string; href?: string }
interface NavGroup { label?: string; items: NavItem[] }

// Full nav for authenticated users. Sport-scoped paths are built lazily so
// each entry resolves to the user's currently-active sport (e.g. /pickleball
// rather than a hardcoded slug). The `/` and `/overlay` paths stay flat.
function getBaseAuthNavGroups(sportSlug: string): NavGroup[] {
  const s = sportSlug ? `/${sportSlug}` : ''
  return [
    { items: [
      { label: 'Home', icon: Home, path: '/' },
      { label: 'Dashboard', icon: LayoutDashboard, path: `${s}/dashboard` },
      { label: 'My Assets', icon: FolderKanban, path: `${s}/manage` },
    ]},
    { label: 'Events', items: [
      { label: 'Leagues', icon: Medal, path: `${s}/leagues` },
      { label: 'Tournaments', icon: Trophy, path: `${s}/tournaments` },
    ]},
    { label: 'Manage', items: [
      { label: 'Venues & Courts', icon: MapPin, path: `${s}/venues` },
      { label: 'Players', icon: Users, path: `${s}/players` },
      { label: 'Teams', icon: UsersRound, path: `${s}/teams` },
      { label: 'Organizations', icon: Building2, path: `${s}/organizations` },
    ]},
    { label: 'Scoring', items: [
      { label: 'Ref Console', icon: Gavel, path: `${s}/ref` },
      { label: 'Scorekeeper', icon: ClipboardList, path: `${s}/scorekeeper` },
      { label: 'Quick Match', icon: Zap, path: `${s}/quick-match` },
    ]},
    // Note: trailing slash is intentional. The TanStack Router file-based
    // route is registered with fullPath '/overlay/'. Without the slash,
    // TanStack matches /overlay against the parametrized /$sport route
    // (with params.sport='overlay'), and SportGuard bounces to /, which
    // then auto-redirects to dashboard for single-sport authenticated users.
    { label: 'Broadcast', items: [{ label: 'Overlay', icon: Tv, path: '/overlay/' }] },
  ]
}

function getAdminNavGroup(sportSlug: string): NavGroup {
  const s = sportSlug ? `/${sportSlug}` : ''
  return {
    label: 'Admin', items: [
      { label: 'Admin', icon: Shield, path: `${s}/admin` },
    ],
  }
}

// Roles that can see Scoring nav
const SCORING_ROLES = new Set([
  'platform_admin', 'tournament_director', 'head_referee', 'referee', 'scorekeeper',
])

// Roles that can see Broadcast nav
const BROADCAST_ROLES = new Set([
  'platform_admin', 'tournament_director', 'broadcast_operator',
])

function getAuthNavGroups(role: string | undefined, sportSlug: string): NavGroup[] {
  const baseAuthNavGroups = getBaseAuthNavGroups(sportSlug)
  const groups: NavGroup[] = []

  // Core nav (Home, Dashboard, My Assets) — all authenticated users
  groups.push(baseAuthNavGroups[0]) // Home/Dashboard/My Assets
  groups.push(baseAuthNavGroups[1]) // Events (Leagues, Tournaments)
  groups.push(baseAuthNavGroups[2]) // Manage (Venues, Players, Teams, Orgs)

  // Scoring — only scoring-eligible roles
  if (role && SCORING_ROLES.has(role)) {
    groups.push(baseAuthNavGroups[3]) // Scoring
  }

  // Broadcast — only broadcast-eligible roles
  if (role && BROADCAST_ROLES.has(role)) {
    groups.push(baseAuthNavGroups[4]) // Broadcast
  }

  // Admin — platform_admin only
  if (role === 'platform_admin') {
    groups.push(getAdminNavGroup(sportSlug))
  }

  return groups
}

// Reduced nav for logged-out users
const publicNavGroups: NavGroup[] = [
  { items: [{ label: 'Home', icon: Home, path: '/' }] },
  { label: 'Browse', items: [
    { label: 'Leagues', icon: Medal, path: '/public/leagues' },
    { label: 'Tournaments', icon: Trophy, path: '/public/tournaments' },
    { label: 'Venues', icon: MapPin, path: '/public/venues' },
    { label: 'News', icon: Newspaper, path: '/news', href: 'https://news.courtcommand.app' },
  ]},
]

export function Sidebar({ user, onLogout }: SidebarProps) {
  const isMobile = useIsMobile()
  const matchRoute = useMatchRoute()
  const location = useLocation()
  const { sport } = useSport()
  const { signIn } = useAuth()
  const sportSlug = sport?.slug ?? ''
  const isAuthenticated = !!user
  const navGroups = isAuthenticated ? getAuthNavGroups(user?.role, sportSlug) : publicNavGroups

  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!isMobile) localStorage.setItem(STORAGE_KEY, String(expanded))
  }, [expanded, isMobile])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Per spec 3.2: while scoring is active on mobile, the sidebar drawer
  // collapses fully so the scoring UI owns the viewport.
  const isScoringActive = /^\/(ref|scorekeeper)\/matches\/[^/]+/.test(
    location.pathname,
  )
  useEffect(() => {
    if (isScoringActive && isMobile) setMobileOpen(false)
  }, [isScoringActive, isMobile])

  const isActive = (path: string) => {
    if (path === '/') return matchRoute({ to: '/', fuzzy: false })
    return matchRoute({ to: path, fuzzy: true })
  }

  const displayName = user
    ? (user.display_name || `${user.first_name} ${user.last_name}`)
    : ''

  if (isMobile) {
    return (
      <>
        <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4 border-b border-(--color-border) bg-(--color-bg-sidebar)">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-hover)" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <img src="/logo-wordmark.svg" alt="Court Command" className="h-6 dark:block hidden" decoding="async" />
          <img src="/logo-wordmark-dark.svg" alt="Court Command" className="h-6 dark:hidden" decoding="async" />
          {user ? (
            <Avatar name={displayName} size="sm" />
          ) : (
            <button
              type="button"
              onClick={() => signIn('/')}
              className="text-sm font-medium text-cyan-400 hover:text-cyan-300"
            >
              Sign In
            </button>
          )}
        </header>
        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
            <nav aria-label="Main navigation" className="fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-(--color-bg-sidebar) border-r border-(--color-border) overflow-y-auto">
              <div className="p-4">
                <div className="flex items-center justify-between mb-6">
                  <img src="/logo-wordmark.svg" alt="Court Command" className="h-7 dark:block hidden" decoding="async" />
                  <img src="/logo-wordmark-dark.svg" alt="Court Command" className="h-7 dark:hidden" decoding="async" />
                  <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-hover)" aria-label="Close navigation">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                </div>
                <NavContent expanded={true} isActive={isActive} navGroups={navGroups} />
              </div>
      {user && onLogout ? (
        <SidebarFooter expanded={true} displayName={displayName} publicId={user.public_id} onLogout={onLogout} sportSlug={sportSlug} />
      ) : (
        <PublicFooter expanded={true} />
      )}
            </nav>
          </>
        )}
      </>
    )
  }

  return (
    <nav aria-label="Main navigation" className={cn('fixed top-0 left-0 bottom-0 z-30 flex flex-col border-r border-(--color-border) bg-(--color-bg-sidebar) transition-[width] duration-200 ease-in-out', expanded ? 'w-[220px]' : 'w-14')}>
      <div className={cn('flex items-center h-14 border-b border-(--color-border)', expanded ? 'px-4 justify-between' : 'justify-center')}>
        {expanded ? (
          <>
            <img src="/logo-wordmark.svg" alt="Court Command" className="h-6 dark:block hidden" decoding="async" />
            <img src="/logo-wordmark-dark.svg" alt="Court Command" className="h-6 dark:hidden" decoding="async" />
            <button onClick={() => setExpanded(false)} className="p-1.5 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-hover)" aria-label="Collapse sidebar">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button onClick={() => setExpanded(true)} className="p-1.5 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-hover)" aria-label="Expand sidebar">
            <Menu className="h-5 w-5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-2">
        <NavContent expanded={expanded} isActive={isActive} navGroups={navGroups} />
      </div>
      {user && onLogout ? (
        <SidebarFooter expanded={expanded} displayName={displayName} publicId={user.public_id} onLogout={onLogout} sportSlug={sportSlug} />
      ) : (
        <PublicFooter expanded={expanded} />
      )}
    </nav>
  )
}

function NavContent({ expanded, isActive, navGroups }: { expanded: boolean; isActive: (path: string) => unknown; navGroups: NavGroup[] }) {
  const { openSearch } = useSearchModal()

  return (
    <div className="space-y-4">
      {/* Search trigger */}
      <button
        onClick={openSearch}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary) transition-colors',
          expanded ? '' : 'justify-center px-2',
        )}
        title={!expanded ? 'Search (Cmd+K)' : undefined}
      >
        <Search className="h-5 w-5 shrink-0" />
        {expanded && (
          <>
            <span className="flex-1 text-left">Search</span>
            <kbd className="text-[10px] font-medium text-(--color-text-secondary) border border-(--color-border) rounded px-1 py-0.5">
              {'\u2318'}K
            </kbd>
          </>
        )}
      </button>

      {navGroups.map((group, gi) => (
        <div key={gi}>
          {group.label && expanded && (
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-(--color-text-secondary)">{group.label}</p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.path)
              const classes = cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors', expanded ? '' : 'justify-center px-2',
                active ? 'bg-cyan-500/10 text-cyan-400 font-medium' : 'text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary)'
              )
              if (item.href) {
                return (
                  <a key={item.path} href={item.href} target="_blank" rel="noopener noreferrer"
                    className={classes}
                    title={!expanded ? item.label : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {expanded && <span>{item.label}</span>}
                  </a>
                )
              }
              return (
                <Link key={item.path} to={item.path}
                  className={classes}
                  title={!expanded ? item.label : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {expanded && <span>{item.label}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function SidebarFooter({ expanded, displayName, publicId, onLogout, sportSlug }: { expanded: boolean; displayName: string; publicId: string; onLogout: () => void; sportSlug: string }) {
  return (
    <div className={cn('border-t border-(--color-border) p-2 space-y-1')}>
      <ThemeToggle collapsed={!expanded} />
      {/* Switch sport: bounces back to the sport picker (/) so the user
          can re-pick. Useful for multi-sport users; SportGuard also
          redirects here when the URL sport doesn't match the JWT org. */}
      <Link
        to="/"
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary)',
          expanded ? '' : 'justify-center px-2',
        )}
        title={!expanded ? 'Switch sport' : undefined}
      >
        <Repeat className="h-5 w-5 shrink-0" />
        {expanded && <span>Switch sport</span>}
      </Link>
      {expanded ? (
        <div className="flex items-center gap-3 px-3 py-2">
          <Link to="/$sport/profile" params={{ sport: sportSlug }} className="flex items-center gap-3 flex-1 min-w-0 rounded-lg hover:bg-(--color-bg-hover) -mx-1 px-1 py-0.5 transition-colors">
            <Avatar name={displayName} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-(--color-text-primary) truncate">{displayName}</p>
              <p className="text-xs text-(--color-text-secondary)">{publicId}</p>
            </div>
          </Link>
          <button onClick={onLogout} className="p-1.5 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-hover)" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button onClick={onLogout} className="flex justify-center w-full p-2 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-hover)" aria-label="Log out" title="Log out">
          <LogOut className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

function PublicFooter({ expanded }: { expanded: boolean }) {
  const { signIn } = useAuth()
  return (
    <div className={cn('border-t border-(--color-border) p-2 space-y-1')}>
      <ThemeToggle collapsed={!expanded} />
      <button
        type="button"
        onClick={() => signIn('/')}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-cyan-400 hover:bg-cyan-500/10 w-full',
          expanded ? '' : 'justify-center px-2',
        )}
        title={!expanded ? 'Sign In' : undefined}
      >
        <LogIn className="h-5 w-5 shrink-0" />
        {expanded && <span>Sign In</span>}
      </button>
    </div>
  )
}
