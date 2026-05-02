// web/src/routes/$sport/profile.tsx
//
// Phase 3 (Logto) profile edit form. Hits the new JWT-protected
// /api/v1/me/profile endpoint backed by the player_profiles table.
// The legacy /api/v1/players/me cookie-session endpoint is still used
// elsewhere (e.g. PlayerForm in features/registry/players) until
// Phase 6 cutover.
//
// The form's save behavior follows the backend's COALESCE narg pattern:
// only fields the user actually edited are sent on PATCH so untouched
// columns are preserved. Initial values come from a snapshot taken at
// load time; on Save we diff against that snapshot and PATCH only the
// changed fields.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { AuthGuard } from '../../features/auth/AuthGuard'
import { apiGet, apiPatch, ApiRequestError } from '../../lib/api'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Select } from '../../components/Select'
import { Textarea } from '../../components/Textarea'
import { FormField } from '../../components/FormField'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'

// PlayerProfile mirrors api/service/profile.go's PlayerProfileDTO field
// for field. Keep these in sync. The omitempty on the Go side means
// missing fields arrive as undefined (not null) -- the form treats both
// as "unset" and renders an empty input.
interface PlayerProfile {
  user_id: number
  phone?: string | null
  dupr_id?: string | null
  vair_id?: string | null
  paddle_brand?: string | null
  paddle_model?: string | null
  gender?: string | null
  handedness?: string | null
  date_of_birth?: string | null // YYYY-MM-DD
  bio?: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  postal_code?: string | null
  formatted_address?: string | null
  latitude?: number | null
  longitude?: number | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  medical_notes?: string | null
  avatar_url?: string | null
  is_profile_hidden: boolean
}

// Subset of PlayerProfile fields the form actually edits. user_id and
// the geocoding-derived columns (latitude, longitude, formatted_address)
// are read-only here -- they're populated by future address-autocomplete
// integration, not the form.
type EditableProfile = Omit<
  PlayerProfile,
  'user_id' | 'latitude' | 'longitude' | 'formatted_address'
>

// Values must match the CHECK constraints in
// api/db/migrations/00002_add_player_profile.sql. Empty string maps to
// the JSON nullable "unset" representation when serialised.
const GENDER_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

const HANDEDNESS_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
  { value: 'ambidextrous', label: 'Ambidextrous' },
]

// emptyEditable is the form's initial state for a fresh user with no
// player_profiles row yet. All strings are '' (controlled inputs need a
// definite value); is_profile_hidden defaults to false to match the DB.
const emptyEditable: EditableProfile = {
  phone: '',
  dupr_id: '',
  vair_id: '',
  paddle_brand: '',
  paddle_model: '',
  gender: '',
  handedness: '',
  date_of_birth: '',
  bio: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state_province: '',
  country: '',
  postal_code: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  medical_notes: '',
  avatar_url: '',
  is_profile_hidden: false,
}

// fromProfile coerces nulls/undefined to '' so React's controlled inputs
// stay happy. The mirror direction (form -> wire) happens in buildPatch.
function fromProfile(p: PlayerProfile): EditableProfile {
  return {
    phone: p.phone ?? '',
    dupr_id: p.dupr_id ?? '',
    vair_id: p.vair_id ?? '',
    paddle_brand: p.paddle_brand ?? '',
    paddle_model: p.paddle_model ?? '',
    gender: p.gender ?? '',
    handedness: p.handedness ?? '',
    date_of_birth: p.date_of_birth ?? '',
    bio: p.bio ?? '',
    address_line_1: p.address_line_1 ?? '',
    address_line_2: p.address_line_2 ?? '',
    city: p.city ?? '',
    state_province: p.state_province ?? '',
    country: p.country ?? '',
    postal_code: p.postal_code ?? '',
    emergency_contact_name: p.emergency_contact_name ?? '',
    emergency_contact_phone: p.emergency_contact_phone ?? '',
    medical_notes: p.medical_notes ?? '',
    avatar_url: p.avatar_url ?? '',
    is_profile_hidden: p.is_profile_hidden,
  }
}

// buildPatch returns just the fields that differ from the initial
// snapshot. Empty strings are forwarded as-is (the backend treats them
// as "unchanged" because they're non-null pointers; if we wanted to
// clear a field we'd need a sentinel). For the boolean is_profile_hidden
// we always include it when it differs because the backend's
// pgtype.Bool path always overwrites.
function buildPatch(initial: EditableProfile, current: EditableProfile): Partial<EditableProfile> {
  const patch: Partial<EditableProfile> = {}
  ;(Object.keys(current) as Array<keyof EditableProfile>).forEach((key) => {
    if (current[key] !== initial[key]) {
      // Cast through unknown to satisfy TS' index-typed assignment.
      ;(patch as Record<string, unknown>)[key] = current[key]
    }
  })
  return patch
}

function ProfileEdit() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<EditableProfile>(emptyEditable)
  const [initial, setInitial] = useState<EditableProfile>(emptyEditable)
  const [hydrated, setHydrated] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const profileQuery = useQuery<PlayerProfile, ApiRequestError>({
    queryKey: ['profile', 'me'],
    queryFn: () => apiGet<PlayerProfile>('/api/v1/me/profile'),
    retry: false,
    staleTime: 30_000,
  })

  // Hydrate the form once when the query resolves. Subsequent refetches
  // won't blow away in-progress edits because hydrated stays true.
  useEffect(() => {
    if (profileQuery.data && !hydrated) {
      const e = fromProfile(profileQuery.data)
      setDraft(e)
      setInitial(e)
      setHydrated(true)
    }
  }, [profileQuery.data, hydrated])

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<EditableProfile>) =>
      apiPatch<PlayerProfile>('/api/v1/me/profile', patch),
    onSuccess: (saved) => {
      const e = fromProfile(saved)
      setDraft(e)
      setInitial(e)
      void queryClient.invalidateQueries({ queryKey: ['profile', 'me'] })
      toast('success', 'Profile saved')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      toast('error', msg)
    },
  })

  function setField<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key as string]
        return next
      })
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (draft.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date_of_birth)) {
      next.date_of_birth = 'Use format YYYY-MM-DD'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const patch = buildPatch(initial, draft)
    if (Object.keys(patch).length === 0) {
      toast('info', 'No changes to save')
      return
    }
    saveMutation.mutate(patch)
  }

  if (profileQuery.isLoading) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (profileQuery.error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Profile</h1>
        <p role="alert" className="text-red-500">
          Failed to load profile: {profileQuery.error.message}
        </p>
        <Button onClick={() => profileQuery.refetch()} className="mt-4">
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link to="/" className="inline-flex items-center text-sm text-gray-500 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
      <h1 className="text-2xl font-bold mb-6">Edit profile</h1>

      <form onSubmit={onSubmit} className="space-y-8">
        {/* Contact */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Contact</legend>
          <FormField label="Phone" htmlFor="phone">
            <Input
              id="phone"
              type="tel"
              value={draft.phone ?? ''}
              onChange={(e) => setField('phone', e.target.value)}
              placeholder="+1 555 555 0100"
            />
          </FormField>
        </fieldset>

        {/* Pickleball Identity */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Pickleball identity</legend>
          <FormField label="DUPR ID" htmlFor="dupr_id">
            <Input
              id="dupr_id"
              value={draft.dupr_id ?? ''}
              onChange={(e) => setField('dupr_id', e.target.value)}
            />
          </FormField>
          <FormField label="VAIR ID" htmlFor="vair_id">
            <Input
              id="vair_id"
              value={draft.vair_id ?? ''}
              onChange={(e) => setField('vair_id', e.target.value)}
            />
          </FormField>
        </fieldset>

        {/* Equipment */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Equipment</legend>
          <FormField label="Paddle brand" htmlFor="paddle_brand">
            <Input
              id="paddle_brand"
              value={draft.paddle_brand ?? ''}
              onChange={(e) => setField('paddle_brand', e.target.value)}
            />
          </FormField>
          <FormField label="Paddle model" htmlFor="paddle_model">
            <Input
              id="paddle_model"
              value={draft.paddle_model ?? ''}
              onChange={(e) => setField('paddle_model', e.target.value)}
            />
          </FormField>
        </fieldset>

        {/* Demographics */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Demographics</legend>
          <FormField label="Gender" htmlFor="gender">
            <Select
              id="gender"
              value={draft.gender ?? ''}
              onChange={(e) => setField('gender', e.target.value)}
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Handedness" htmlFor="handedness">
            <Select
              id="handedness"
              value={draft.handedness ?? ''}
              onChange={(e) => setField('handedness', e.target.value)}
            >
              {HANDEDNESS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Date of birth"
            htmlFor="date_of_birth"
            error={errors.date_of_birth}
          >
            <Input
              id="date_of_birth"
              type="date"
              value={draft.date_of_birth ?? ''}
              onChange={(e) => setField('date_of_birth', e.target.value)}
            />
          </FormField>
          <FormField label="Bio" htmlFor="bio">
            <Textarea
              id="bio"
              rows={4}
              value={draft.bio ?? ''}
              onChange={(e) => setField('bio', e.target.value)}
            />
          </FormField>
        </fieldset>

        {/* Address */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Address</legend>
          <FormField label="Address line 1" htmlFor="address_line_1">
            <Input
              id="address_line_1"
              value={draft.address_line_1 ?? ''}
              onChange={(e) => setField('address_line_1', e.target.value)}
            />
          </FormField>
          <FormField label="Address line 2" htmlFor="address_line_2">
            <Input
              id="address_line_2"
              value={draft.address_line_2 ?? ''}
              onChange={(e) => setField('address_line_2', e.target.value)}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="City" htmlFor="city">
              <Input
                id="city"
                value={draft.city ?? ''}
                onChange={(e) => setField('city', e.target.value)}
              />
            </FormField>
            <FormField label="State / Province" htmlFor="state_province">
              <Input
                id="state_province"
                value={draft.state_province ?? ''}
                onChange={(e) => setField('state_province', e.target.value)}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Country" htmlFor="country">
              <Input
                id="country"
                value={draft.country ?? ''}
                onChange={(e) => setField('country', e.target.value)}
              />
            </FormField>
            <FormField label="Postal code" htmlFor="postal_code">
              <Input
                id="postal_code"
                value={draft.postal_code ?? ''}
                onChange={(e) => setField('postal_code', e.target.value)}
              />
            </FormField>
          </div>
        </fieldset>

        {/* Emergency Contact (no relation field -- column doesn't exist) */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Emergency contact</legend>
          <FormField label="Name" htmlFor="emergency_contact_name">
            <Input
              id="emergency_contact_name"
              value={draft.emergency_contact_name ?? ''}
              onChange={(e) => setField('emergency_contact_name', e.target.value)}
            />
          </FormField>
          <FormField label="Phone" htmlFor="emergency_contact_phone">
            <Input
              id="emergency_contact_phone"
              type="tel"
              value={draft.emergency_contact_phone ?? ''}
              onChange={(e) => setField('emergency_contact_phone', e.target.value)}
            />
          </FormField>
        </fieldset>

        {/* Medical */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Medical</legend>
          <FormField label="Medical notes" htmlFor="medical_notes">
            <Textarea
              id="medical_notes"
              rows={3}
              value={draft.medical_notes ?? ''}
              onChange={(e) => setField('medical_notes', e.target.value)}
            />
          </FormField>
        </fieldset>

        {/* Privacy */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-semibold">Privacy</legend>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.is_profile_hidden}
              onChange={(e) => setField('is_profile_hidden', e.target.checked)}
            />
            <span>Hide my profile from public directories</span>
          </label>
        </fieldset>

        <div className="flex gap-3">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export const Route = createFileRoute('/$sport/profile')({
  component: () => (
    <AuthGuard>
      <ProfileEdit />
    </AuthGuard>
  ),
})
