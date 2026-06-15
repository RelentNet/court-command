import { Link } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useSearchModal } from '../features/search/SearchContext'
import { useAuth } from '../auth/useAuth'

export function PublicTopBar() {
  const { openSearch } = useSearchModal()
  const { isAuthenticated, isLoading, signIn } = useAuth()

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4 border-b border-(--color-border) bg-(--color-bg-sidebar)/95 backdrop-blur-sm">
      <Link to="/" className="shrink-0">
        <img
          src="/logo-wordmark.svg"
          alt="Court Command"
          className="h-6 dark:block hidden"
          decoding="async"
        />
        <img
          src="/logo-wordmark-dark.svg"
          alt="Court Command"
          className="h-6 dark:hidden"
          decoding="async"
        />
      </Link>

      <div className="flex items-center gap-2">
        <button
          onClick={openSearch}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-(--color-text-secondary) hover:bg-(--color-bg-hover) hover:text-(--color-text-primary) transition-colors border border-(--color-border)"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline text-[10px] font-medium text-(--color-text-secondary) border border-(--color-border) rounded px-1 py-0.5 ml-1">
            {'\u2318'}K
          </kbd>
        </button>

        {isLoading ? (
          <div className="h-8 w-16 rounded-lg bg-(--color-bg-hover) animate-pulse" />
        ) : isAuthenticated ? (
          <Link
            to="/"
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors"
          >
            Dashboard
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => signIn('/')}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  )
}
