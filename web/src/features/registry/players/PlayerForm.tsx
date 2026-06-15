import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMyProfile, useUpdateProfile } from './hooks'
import { useToast } from '../../../components/Toast'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { Select } from '../../../components/Select'
import { Textarea } from '../../../components/Textarea'
import { FormField } from '../../../components/FormField'
import { ImageUpload } from '../../../components/ImageUpload'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { ArrowLeft, User } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { useSport } from '../../../auth/SportContext'
// Values MUST match CHECK constraint in api/db/migrations/00002_add_player_profile.sql
// The empty value ('') sends null on submit — kept as the "not set" default.
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

export function PlayerForm() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: profile, isLoading, error } = useMyProfile()
  const updateProfile = useUpdateProfile()

  const [displayName, setDisplayName] = useState('')
  const [gender, setGender] = useState('')
  const [handedness, setHandedness] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [city, setCity] = useState('')
  const [stateProvince, setStateProvince] = useState('')
  const [country, setCountry] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [phone, setPhone] = useState('')
  const [paddleBrand, setPaddleBrand] = useState('')
  const [paddleModel, setPaddleModel] = useState('')
  const [duprId, setDuprId] = useState('')
  const [vairId, setVairId] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [medicalNotes, setMedicalNotes] = useState('')
  const [isProfileHidden, setIsProfileHidden] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize form with profile data once loaded
  if (profile && !initialized) {
    setDisplayName(profile.display_name ?? '')
    setGender(profile.gender ?? '')
    setHandedness(profile.handedness ?? '')
    setAvatarUrl(profile.avatar_url ?? null)
    setBio(profile.bio ?? '')
    setCity(profile.city ?? '')
    setStateProvince(profile.state_province ?? '')
    setCountry(profile.country ?? '')
    setPostalCode(profile.postal_code ?? '')
    setAddressLine1(profile.address_line_1 ?? '')
    setAddressLine2(profile.address_line_2 ?? '')
    setPhone(profile.phone ?? '')
    setPaddleBrand(profile.paddle_brand ?? '')
    setPaddleModel(profile.paddle_model ?? '')
    setDuprId(profile.dupr_id ?? '')
    setVairId(profile.vair_id ?? '')
    setEmergencyContactName(profile.emergency_contact_name ?? '')
    setEmergencyContactPhone(profile.emergency_contact_phone ?? '')
    setMedicalNotes(profile.medical_notes ?? '')
    setIsProfileHidden(profile.is_profile_hidden)
    setInitialized(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-lg">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <EmptyState
        icon={<User className="h-12 w-12" />}
        title="Could not load profile"
        description="There was an error loading your profile. Please try again."
      />
    )
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (displayName && displayName.length > 100) errs.display_name = 'Display name must be 100 characters or fewer'
    if (phone && !/^[+\d\s()-]*$/.test(phone)) errs.phone = 'Enter a valid phone number'
    if (emergencyContactPhone && !/^[+\d\s()-]*$/.test(emergencyContactPhone))
      errs.emergency_contact_phone = 'Enter a valid phone number'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload: Record<string, unknown> = {
      display_name: displayName.trim() || null,
      gender: gender || null,
      handedness: handedness || null,
      avatar_url: avatarUrl,
      bio: bio.trim() || null,
      city: city.trim() || null,
      state_province: stateProvince.trim() || null,
      country: country.trim() || null,
      postal_code: postalCode.trim() || null,
      address_line_1: addressLine1.trim() || null,
      address_line_2: addressLine2.trim() || null,
      phone: phone.trim() || null,
      paddle_brand: paddleBrand.trim() || null,
      paddle_model: paddleModel.trim() || null,
      dupr_id: duprId.trim() || null,
      vair_id: vairId.trim() || null,
      emergency_contact_name: emergencyContactName.trim() || null,
      emergency_contact_phone: emergencyContactPhone.trim() || null,
      medical_notes: medicalNotes.trim() || null,
      is_profile_hidden: isProfileHidden,
    }

    updateProfile.mutate(payload as any, {
      onSuccess: () => {
        toast('success', 'Profile updated')
        navigate({ to: '/$sport/dashboard', params: { sport: sportSlug } })
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  return (
    <div>
      <Link
        to="/$sport/dashboard" params={{ sport: sportSlug }}
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-(--color-text-primary) mb-1">
        Edit Profile
      </h1>
      <p className="text-sm text-(--color-text-secondary) mb-6">
        {profile.first_name} {profile.last_name} &middot; {profile.public_id}
      </p>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
        {/* Basic Info */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-(--color-text-primary) mb-2">Basic Information</legend>

          <FormField label="Display Name" htmlFor="display_name" error={errors.display_name}>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How you want to appear on leaderboards"
              error={!!errors.display_name}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Gender" htmlFor="gender">
              <Select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Handedness" htmlFor="handedness">
              <Select id="handedness" value={handedness} onChange={(e) => setHandedness(e.target.value)}>
                {HANDEDNESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </FormField>
          </div>

          <ImageUpload
            value={avatarUrl}
            onChange={setAvatarUrl}
            label="Profile Photo"
          />

          <FormField label="Bio" htmlFor="bio">
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others about yourself..."
              rows={3}
            />
          </FormField>
        </fieldset>

        {/* Location */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-(--color-text-primary) mb-2">Location</legend>

          <FormField label="Address Line 1" htmlFor="address_line_1">
            <Input
              id="address_line_1"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Street address"
            />
          </FormField>

          <FormField label="Address Line 2" htmlFor="address_line_2">
            <Input
              id="address_line_2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Apt, suite, etc."
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="City" htmlFor="city">
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
            </FormField>

            <FormField label="State / Province" htmlFor="state_province">
              <Input
                id="state_province"
                value={stateProvince}
                onChange={(e) => setStateProvince(e.target.value)}
                placeholder="State or province"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Country" htmlFor="country">
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
              />
            </FormField>

            <FormField label="Postal Code" htmlFor="postal_code">
              <Input
                id="postal_code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="Postal code"
              />
            </FormField>
          </div>
        </fieldset>

        {/* Contact */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-(--color-text-primary) mb-2">Contact</legend>

          <FormField label="Phone" htmlFor="phone" error={errors.phone}>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              error={!!errors.phone}
            />
          </FormField>
        </fieldset>

        {/* Paddle Info */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-(--color-text-primary) mb-2">Equipment</legend>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Paddle Brand" htmlFor="paddle_brand">
              <Input
                id="paddle_brand"
                value={paddleBrand}
                onChange={(e) => setPaddleBrand(e.target.value)}
                placeholder="e.g. JOOLA"
              />
            </FormField>

            <FormField label="Paddle Model" htmlFor="paddle_model">
              <Input
                id="paddle_model"
                value={paddleModel}
                onChange={(e) => setPaddleModel(e.target.value)}
                placeholder="e.g. Hyperion CFS 16"
              />
            </FormField>
          </div>
        </fieldset>

        {/* External IDs */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-(--color-text-primary) mb-2">External Ratings</legend>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="DUPR ID" htmlFor="dupr_id">
              <Input
                id="dupr_id"
                value={duprId}
                onChange={(e) => setDuprId(e.target.value)}
                placeholder="DUPR ID"
              />
            </FormField>

            <FormField label="VAIR ID" htmlFor="vair_id">
              <Input
                id="vair_id"
                value={vairId}
                onChange={(e) => setVairId(e.target.value)}
                placeholder="VAIR ID"
              />
            </FormField>
          </div>
        </fieldset>

        {/* Emergency Contact */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-(--color-text-primary) mb-2">Emergency Contact</legend>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contact Name" htmlFor="emergency_contact_name">
              <Input
                id="emergency_contact_name"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder="Full name"
              />
            </FormField>

            <FormField label="Contact Phone" htmlFor="emergency_contact_phone" error={errors.emergency_contact_phone}>
              <Input
                id="emergency_contact_phone"
                type="tel"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                placeholder="Phone number"
                error={!!errors.emergency_contact_phone}
              />
            </FormField>
          </div>

          <FormField label="Medical Notes" htmlFor="medical_notes">
            <Textarea
              id="medical_notes"
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              placeholder="Allergies, conditions, or other notes for emergency responders"
              rows={2}
            />
          </FormField>
        </fieldset>

        {/* Privacy */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-(--color-text-primary) mb-2">Privacy</legend>

          <label htmlFor="is_profile_hidden" className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="is_profile_hidden"
              checked={isProfileHidden}
              onChange={(e) => setIsProfileHidden(e.target.checked)}
              className="h-4 w-4 rounded border-(--color-border) text-cyan-500 focus:ring-cyan-400"
            />
            <div>
              <p className="text-sm font-medium text-(--color-text-primary)">Hide my profile</p>
              <p className="text-xs text-(--color-text-secondary)">
                Your name will still appear in match results, but your full profile will be hidden from search and public view.
              </p>
            </div>
          </label>
        </fieldset>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={updateProfile.isPending}>
            Save Changes
          </Button>
          <Link to="/$sport/dashboard" params={{ sport: sportSlug }}>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
