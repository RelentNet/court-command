import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { Select } from '../../../components/Select'
import { FormField } from '../../../components/FormField'
import { useToast } from '../../../components/Toast'
import { useUpdateCourt, type Court } from './hooks'

interface CourtEditFormProps {
  court: Court
  onSuccess?: () => void
  onCancel?: () => void
}

const STREAM_PLATFORMS = [
  { value: '', label: 'None' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'vimeo', label: 'Vimeo' },
  { value: 'hls', label: 'HLS / M3U8' },
  { value: 'other', label: 'Other (iframe)' },
]

const URL_PLACEHOLDERS: Record<string, string> = {
  youtube: 'https://www.youtube.com/watch?v=... or https://youtu.be/...',
  twitch: 'https://www.twitch.tv/channelname',
  vimeo: 'https://vimeo.com/123456789',
  hls: 'https://stream.example.com/live/stream.m3u8',
  other: 'https://example.com/embed/player',
}

export function CourtEditForm({ court, onSuccess, onCancel }: CourtEditFormProps) {
  const { toast } = useToast()
  const updateCourt = useUpdateCourt(String(court.id))

  const [name, setName] = useState(court.name)
  const [surfaceType, setSurfaceType] = useState(court.surface_type ?? '')
  const [isShowCourt, setIsShowCourt] = useState(court.is_show_court)
  const [isActive, setIsActive] = useState(court.is_active)
  const [notes, setNotes] = useState(court.notes ?? '')
  const [streamType, setStreamType] = useState(court.stream_type ?? '')
  const [streamUrl, setStreamUrl] = useState(court.stream_url ?? '')
  const [streamTitle, setStreamTitle] = useState(court.stream_title ?? '')
  const [streamIsLive, setStreamIsLive] = useState(court.stream_is_live)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    updateCourt.mutate(
      {
        name: name.trim(),
        surface_type: surfaceType || null,
        is_show_court: isShowCourt,
        is_active: isActive,
        notes: notes.trim() || null,
        stream_type: streamType || null,
        stream_url: streamUrl.trim() || null,
        stream_title: streamTitle.trim() || null,
        stream_is_live: streamIsLive,
      },
      {
        onSuccess: () => {
          toast('success', 'Court updated')
          onSuccess?.()
        },
        onError: () => toast('error', 'Failed to update court'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div>
        <h3 className="text-sm font-medium text-(--color-text-primary) mb-3">Basic Info</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Court Name" htmlFor="court-name" required>
            <Input
              id="court-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Surface Type" htmlFor="surface-type">
            <Select
              id="surface-type"
              value={surfaceType}
              onChange={(e) => setSurfaceType(e.target.value)}
            >
              <option value="">Any / Unknown</option>
              <option value="indoor_hard">Indoor Hard</option>
              <option value="outdoor_concrete">Outdoor Concrete</option>
              <option value="outdoor_sport_court">Outdoor Sport Court</option>
              <option value="outdoor_wood">Outdoor Wood</option>
              <option value="temporary">Temporary</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
        </div>
        <div className="flex gap-6 mt-4">
          <label className="flex items-center gap-2 text-sm text-(--color-text-primary) cursor-pointer">
            <input
              type="checkbox"
              checked={isShowCourt}
              onChange={(e) => setIsShowCourt(e.target.checked)}
              className="rounded"
            />
            Show Court (broadcast/streaming)
          </label>
          <label className="flex items-center gap-2 text-sm text-(--color-text-primary) cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            Active
          </label>
        </div>
      </div>

      {/* Stream settings */}
      <div>
        <h3 className="text-sm font-medium text-(--color-text-primary) mb-3">Live Stream</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Platform" htmlFor="stream-platform">
            <Select
              id="stream-platform"
              value={streamType}
              onChange={(e) => {
                setStreamType(e.target.value)
                if (!e.target.value) {
                  setStreamUrl('')
                  setStreamTitle('')
                  setStreamIsLive(false)
                }
              }}
            >
              {STREAM_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FormField>
          {streamType && (
            <FormField label="Stream URL" htmlFor="stream-url">
              <Input
                id="stream-url"
                value={streamUrl}
                onChange={(e) => {
                  setStreamUrl(e.target.value)
                  // smoke 8.15: a court can't be "live" with no stream URL — clearing
                  // the URL must reset the live flag so no orphaned live-without-URL state
                  // (which renders a "Live" badge but no video embed) can persist.
                  if (!e.target.value.trim()) setStreamIsLive(false)
                }}
                placeholder={URL_PLACEHOLDERS[streamType] ?? 'Enter stream URL'}
              />
            </FormField>
          )}
        </div>
        {streamType && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <FormField label="Stream Title (optional)" htmlFor="stream-title">
              <Input
                id="stream-title"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder="Court 1 - Main Stage"
              />
            </FormField>
            <div className="flex flex-col justify-end pb-1">
              {/* smoke 8.15: "live" requires a stream URL. Disable the toggle until a URL
                  is entered so a court can't be flagged live with no embed to render. */}
              <label
                className={`flex items-center gap-2 text-sm text-(--color-text-primary) ${
                  streamUrl.trim() ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={streamIsLive}
                  disabled={!streamUrl.trim()}
                  onChange={(e) => setStreamIsLive(e.target.checked)}
                  className="rounded disabled:cursor-not-allowed"
                />
                Stream is currently live
              </label>
              {!streamUrl.trim() && (
                <p className="text-xs text-(--color-text-secondary) mt-1">
                  Enter a stream URL to mark this court as live.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <FormField label="Notes" htmlFor="court-notes">
        <Input
          id="court-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes about this court"
        />
      </FormField>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={updateCourt.isPending}>
          Save Changes
        </Button>
      </div>
    </form>
  )
}
