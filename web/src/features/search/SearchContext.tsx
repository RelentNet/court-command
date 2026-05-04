import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { SearchModal } from './SearchModal'

interface SearchContextValue {
  open: boolean
  openSearch: () => void
  closeSearch: () => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

export function useSearchModal() {
  const ctx = useContext(SearchContext)
  if (!ctx) throw new Error('useSearchModal must be used inside SearchProvider')
  return ctx
}

// SearchProvider holds the open/close state ONLY. It does NOT render
// the modal -- because SearchProvider lives in App.tsx as a sibling of
// RouterProvider (so app-shell components like Sidebar/PublicTopBar can
// call openSearch()), but the modal needs to be inside RouterProvider's
// tree so its <Link> children can read router context. Without this
// split, useLinkProps inside SearchModal crashes with
// "Cannot read properties of null (reading 'isServer')" the moment any
// search result tries to render -- and the page blanks.
//
// SearchModalMount is rendered from within __root.tsx (which is inside
// RouterProvider) and reads the open/close state via this context.
export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const openSearch = useCallback(() => setOpen(true), [])
  const closeSearch = useCallback(() => setOpen(false), [])

  // Global Cmd+K / Ctrl+K to toggle. "/" opens search when not focused
  // on an input/textarea/select.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (
        e.key === '/' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <SearchContext.Provider value={{ open, openSearch, closeSearch }}>
      {children}
    </SearchContext.Provider>
  )
}

// SearchModalMount renders the modal. MUST be placed inside
// RouterProvider's tree (i.e. inside a route component), not in
// App.tsx, so <Link> inside the modal has router context.
export function SearchModalMount() {
  const { open, closeSearch } = useSearchModal()
  return <SearchModal open={open} onClose={closeSearch} />
}
