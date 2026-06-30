import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiGetPaginated, type PaginatedData } from '../lib/api'
import { buildQueryString } from '../lib/formatters'
import { cn } from '../lib/cn'
import { useDebounce } from '../hooks/useDebounce'
import { MapPin, X, ChevronDown } from 'lucide-react'

interface Venue {
  id: number
  name: string
  city: string | null
  state_province: string | null
}

interface VenuePickerProps {
  value: number | null
  onChange: (venueId: number | null) => void
  className?: string
}

export function VenuePicker({ value, onChange, className }: VenuePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery<PaginatedData<Venue>>({
    queryKey: ['venues', 'picker', debouncedSearch],
    queryFn: () =>
      apiGetPaginated<Venue>(
        `/api/v1/venues${buildQueryString({ query: debouncedSearch, limit: 20, offset: 0 })}`,
      ),
    enabled: open,
  })

  const { data: selectedVenue } = useQuery<Venue>({
    queryKey: ['venues', value],
    queryFn: () => apiGet<Venue>(`/api/v1/venues/${value}`),
    enabled: !!value && !open,
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const venues = data?.items || []
  const displayName = selectedVenue
    ? `${selectedVenue.name}${selectedVenue.city ? ` \u2014 ${selectedVenue.city}` : ''}`
    : null

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition-colors',
          'border-(--color-border) bg-(--color-bg-primary) text-(--color-text-primary)',
          'hover:border-(--color-text-secondary)',
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <MapPin className="h-4 w-4 text-(--color-text-secondary) shrink-0" />
          {displayName || (
            <span className="text-(--color-text-secondary)">Select venue...</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
                setSearch('')
              }}
              className="p-0.5 hover:text-red-400"
              aria-label="Clear venue"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className="h-4 w-4 text-(--color-text-secondary)" />
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-(--color-border) bg-(--color-bg-primary) shadow-lg">
          <div className="p-2 border-b border-(--color-border)">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search venues..."
              aria-label="Search venues"
              className="w-full rounded-md border border-(--color-border) bg-(--color-bg-secondary) px-3 py-1.5 text-sm text-(--color-text-primary) placeholder:text-(--color-text-secondary) focus:outline-none focus:ring-1 focus:ring-cyan-500"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {venues.length === 0 ? (
              <div className="px-3 py-2 text-sm text-(--color-text-secondary)">
                {debouncedSearch ? 'No venues found' : 'Type to search...'}
              </div>
            ) : (
              venues.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onChange(v.id)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-(--color-bg-hover) transition-colors',
                    v.id === value && 'bg-(--color-bg-hover)',
                  )}
                >
                  <div className="font-medium text-(--color-text-primary)">{v.name}</div>
                  {v.city && (
                    <div className="text-xs text-(--color-text-secondary)">
                      {[v.city, v.state_province].filter(Boolean).join(', ')}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
