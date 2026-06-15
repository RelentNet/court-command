import { useState } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import {
  Home,
  CalendarDays,
  Radio,
  Newspaper,
  MoreHorizontal,
  MapPin,
  Info,
  Mail,
  LogIn,
  X,
} from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { useAuth } from '../auth/useAuth'
import { cn } from '../lib/cn'

interface TabItem {
  label: string
  icon: typeof Home
  path?: string
  href?: string
  action?: 'more'
}

const TABS: TabItem[] = [
  { label: 'Home', icon: Home, path: '/' },
  { label: 'Events', icon: CalendarDays, path: '/public/events' },
  { label: 'Live', icon: Radio, path: '/public/live' },
  { label: 'News', icon: Newspaper, href: 'https://news.courtcommand.app' },
  { label: 'More', icon: MoreHorizontal, action: 'more' },
]

export function PublicBottomTabs() {
  const [moreOpen, setMoreOpen] = useState(false)
  const matchRoute = useMatchRoute()
  const { isAuthenticated, signIn } = useAuth()

  const isActive = (path: string) => {
    if (path === '/') return matchRoute({ to: '/', fuzzy: false })
    return matchRoute({ to: path, fuzzy: true })
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav
        aria-label="Public navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-(--color-border) bg-(--color-bg-sidebar)/95 backdrop-blur-sm safe-area-bottom"
      >
        <div className="flex items-stretch justify-around h-14">
          {TABS.map((tab) => {
            if (tab.href) {
              return (
                <a
                  key={tab.label}
                  href={tab.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                >
                  <tab.icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </a>
              )
            }

            if (tab.action === 'more') {
              return (
                <button
                  key={tab.label}
                  onClick={() => setMoreOpen(true)}
                  className={cn(
                    'flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors',
                    moreOpen
                      ? 'text-cyan-400'
                      : 'text-(--color-text-secondary) hover:text-(--color-text-primary)',
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  <span>{tab.label}</span>
                </button>
              )
            }

            const active = tab.path ? isActive(tab.path) : false
            return (
              <Link
                key={tab.label}
                to={tab.path!}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors',
                  active
                    ? 'text-cyan-400'
                    : 'text-(--color-text-secondary) hover:text-(--color-text-primary)',
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* "More" bottom sheet */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={() => setMoreOpen(false)}
            aria-hidden
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-(--color-border) bg-(--color-bg-primary) pb-safe animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-(--color-border)">
              <h2 className="text-sm font-semibold text-(--color-text-primary)">
                More
              </h2>
              <button
                onClick={() => setMoreOpen(false)}
                className="p-1.5 rounded-lg text-(--color-text-secondary) hover:bg-(--color-bg-hover)"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-1">
              <MoreLink
                icon={MapPin}
                label="Venues"
                to="/public/venues"
                onClick={() => setMoreOpen(false)}
              />
              <MoreLink
                icon={Info}
                label="About"
                href="https://courtcommand.app/about"
                onClick={() => setMoreOpen(false)}
              />
              <MoreLink
                icon={Mail}
                label="Contact"
                href="https://courtcommand.app/contact"
                onClick={() => setMoreOpen(false)}
              />

              {!isAuthenticated && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    signIn('/')
                  }}
                  className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-cyan-400 hover:bg-cyan-500/10"
                >
                  <LogIn className="h-5 w-5 shrink-0" />
                  <span>Sign In</span>
                </button>
              )}

              <div className="pt-2 border-t border-(--color-border) mt-2">
                <ThemeToggle collapsed={false} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function MoreLink({
  icon: Icon,
  label,
  to,
  href,
  search,
  onClick,
  accent,
}: {
  icon: typeof Home
  label: string
  to?: string
  href?: string
  search?: Record<string, string>
  onClick?: () => void
  accent?: boolean
}) {
  const cls = cn(
    'flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    accent
      ? 'text-cyan-400 hover:bg-cyan-500/10'
      : 'text-(--color-text-primary) hover:bg-(--color-bg-hover)',
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        onClick={onClick}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{label}</span>
      </a>
    )
  }

  return (
    <Link to={to!} search={search} className={cls} onClick={onClick}>
      <Icon className="h-5 w-5 shrink-0" />
      <span>{label}</span>
    </Link>
  )
}
