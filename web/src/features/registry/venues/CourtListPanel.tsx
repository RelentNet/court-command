import { useState } from 'react'
import {
  useVenueCourts,
  useCreateVenueCourt,
  useDeleteVenueCourt,
  type Court,
} from './hooks'
import { Table } from '../../../components/Table'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Modal } from '../../../components/Modal'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { Input } from '../../../components/Input'
import { Select } from '../../../components/Select'
import { FormField } from '../../../components/FormField'
import { EmptyState } from '../../../components/EmptyState'
import { SkeletonTable } from '../../../components/Skeleton'
import { useToast } from '../../../components/Toast'
import { Plus, Trash2, LayoutGrid } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { FormEvent } from 'react'

import { useSport } from '../../../auth/SportContext'
interface CourtListPanelProps {
  venueId: string
}

const SURFACE_TYPES = [
  { value: '', label: 'Select...' },
  { value: 'indoor_hard', label: 'Indoor Hard' },
  { value: 'outdoor_concrete', label: 'Outdoor Concrete' },
  { value: 'outdoor_sport_court', label: 'Outdoor Sport Court' },
  { value: 'outdoor_wood', label: 'Outdoor Wood' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'other', label: 'Other' },
]

export function CourtListPanel({ venueId }: CourtListPanelProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data: courts, isLoading } = useVenueCourts(venueId)
  const createCourt = useCreateVenueCourt(venueId)
  const { toast } = useToast()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Court | null>(null)

  // Form state for new court
  const [courtName, setCourtName] = useState('')
  const [surfaceType, setSurfaceType] = useState('')
  const [isShowCourt, setIsShowCourt] = useState(false)
  const [streamType, setStreamType] = useState('')
  const [streamUrl, setStreamUrl] = useState('')

  const resetForm = () => {
    setCourtName('')
    setSurfaceType('')
    setIsShowCourt(false)
    setStreamType('')
    setStreamUrl('')
  }

  const handleCreateCourt = (e: FormEvent) => {
    e.preventDefault()
    if (!courtName.trim()) return

    createCourt.mutate(
      {
        name: courtName.trim(),
        surface_type: surfaceType || null,
        is_show_court: isShowCourt,
        is_active: true,
        is_temporary: false,
        sort_order: (courts?.length ?? 0) + 1,
        stream_type: streamType || null,
        stream_url: streamUrl.trim() || null,
      },
      {
        onSuccess: () => {
          toast('success', 'Court created')
          setIsAddOpen(false)
          resetForm()
        },
        onError: (err) => toast('error', (err as Error).message),
      },
    )
  }

  const columns = [
    {
      key: 'name',
      header: 'Court Name',
      render: (c: Court) => (
        <Link
          to="/$sport/courts/$courtId"
          params={{ sport: sportSlug, courtId: String(c.id) }}
          className="font-medium text-(--color-accent) hover:underline"
        >
          {c.name}
        </Link>
      ),
    },
    {
      key: 'surface_type',
      header: 'Surface',
      render: (c: Court) => (
        <span className="text-(--color-text-secondary) capitalize">
          {c.surface_type?.replace(/_/g, ' ') || '\u2014'}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'is_show_court',
      header: 'Show Court',
      render: (c: Court) =>
        c.is_show_court ? (
          <Badge variant="success">Yes</Badge>
        ) : (
          <Badge variant="default">No</Badge>
        ),
    },
    {
      key: 'is_active',
      header: 'Active',
      render: (c: Court) =>
        c.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="default">Inactive</Badge>
        ),
    },
    {
      key: 'stream_type',
      header: 'Stream',
      render: (c: Court) => {
        if (!c.stream_type) return <span className="text-(--color-text-secondary)">{'\u2014'}</span>
        const streamVariants: Record<string, 'error' | 'info' | 'success' | 'default'> = {
          youtube: 'error',
          twitch: 'info',
          vimeo: 'info',
          hls: 'success',
        }
        return (
          <Badge variant={streamVariants[c.stream_type] ?? 'default'}>
            {c.stream_type}
          </Badge>
        )
      },
      className: 'hidden lg:table-cell',
    },
    {
      key: 'actions',
      header: '',
      render: (c: Court) => (
        <button
          onClick={() => setDeleteTarget(c)}
          className="text-(--color-text-secondary) hover:text-red-500 transition-colors p-1"
          aria-label={`Delete ${c.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ]

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-(--color-text-primary)">Courts</h2>
        <Button size="sm" variant="secondary" onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Court
        </Button>
      </div>

      {isLoading ? (
        <SkeletonTable rows={4} />
      ) : !courts || courts.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-10 w-10" />}
          title="No courts"
          description="Add courts to this venue."
        />
      ) : (
        <Table columns={columns} data={courts} keyExtractor={(c) => c.id} />
      )}

      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Court">
        <form onSubmit={handleCreateCourt} className="space-y-4">
          <FormField label="Court Name" htmlFor="court_name" required>
            <Input
              id="court_name"
              value={courtName}
              onChange={(e) => setCourtName(e.target.value)}
              placeholder="Court 1"
            />
          </FormField>

          <FormField label="Surface Type" htmlFor="surface_type">
            <Select
              id="surface_type"
              value={surfaceType}
              onChange={(e) => setSurfaceType(e.target.value)}
            >
              {SURFACE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </FormField>

          <label className="flex items-center gap-2 text-sm text-(--color-text-primary) cursor-pointer">
            <input
              type="checkbox"
              checked={isShowCourt}
              onChange={(e) => setIsShowCourt(e.target.checked)}
              className="rounded border-(--color-border)"
            />
            Show Court (broadcast/streaming)
          </label>

          <FormField label="Stream Platform" htmlFor="stream_type">
            <Select
              id="stream_type"
              value={streamType}
              onChange={(e) => setStreamType(e.target.value)}
            >
              <option value="">None</option>
              <option value="youtube">YouTube</option>
              <option value="twitch">Twitch</option>
              <option value="vimeo">Vimeo</option>
              <option value="hls">HLS / M3U8</option>
              <option value="other">Other (iframe)</option>
            </Select>
          </FormField>

          {streamType && (
            <FormField label="Stream URL" htmlFor="stream_url">
              <Input
                id="stream_url"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                placeholder={
                  streamType === 'youtube' ? 'https://youtube.com/watch?v=...' :
                  streamType === 'twitch' ? 'https://twitch.tv/channel' :
                  streamType === 'vimeo' ? 'https://vimeo.com/123456' :
                  streamType === 'hls' ? 'https://stream.example.com/live.m3u8' :
                  'https://example.com/embed'
                }
              />
            </FormField>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createCourt.isPending}>
              Add Court
            </Button>
          </div>
        </form>
      </Modal>

      {deleteTarget && (
        <DeleteCourtDialog
          venueId={venueId}
          court={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function DeleteCourtDialog({
  venueId,
  court,
  onClose,
}: {
  venueId: string
  court: Court
  onClose: () => void
}) {
  const deleteCourt = useDeleteVenueCourt(venueId, court.id)
  const { toast } = useToast()

  const handleConfirm = () => {
    deleteCourt.mutate(undefined, {
      onSuccess: () => {
        toast('success', 'Court deleted')
        onClose()
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Delete Court"
      message={`Delete "${court.name}"? This action cannot be undone.`}
      confirmText="Delete"
      variant="danger"
      loading={deleteCourt.isPending}
    />
  )
}
