import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateVenue, useUpdateVenue, type Venue } from './hooks'
import { useToast } from '../../../components/Toast'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { Select } from '../../../components/Select'
import { US_TIMEZONES } from '../../../lib/constants'
import { Textarea } from '../../../components/Textarea'
import { FormField } from '../../../components/FormField'
import { ImageUpload } from '../../../components/ImageUpload'
import { AddressInput, type AddressData } from '../../../components/AddressInput'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { useSport } from '../../../auth/SportContext'
interface VenueFormProps {
  venue?: Venue
}

export function VenueForm({ venue }: VenueFormProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const createVenue = useCreateVenue()
  const updateVenue = useUpdateVenue(venue ? String(venue.id) : '')

  const isEditing = !!venue

  const [name, setName] = useState(venue?.name ?? '')
  const [address, setAddress] = useState<Partial<AddressData>>({
    formatted_address: venue?.formatted_address ?? '',
    address_line_1: venue?.address_line_1 ?? '',
    address_line_2: venue?.address_line_2 ?? '',
    city: venue?.city ?? '',
    state_province: venue?.state_province ?? '',
    country: venue?.country ?? '',
    postal_code: venue?.postal_code ?? '',
    latitude: venue?.latitude ?? undefined,
    longitude: venue?.longitude ?? undefined,
  })
  const [timezone, setTimezone] = useState(venue?.timezone ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(venue?.website_url ?? '')
  const [contactEmail, setContactEmail] = useState(venue?.contact_email ?? '')
  const [contactPhone, setContactPhone] = useState(venue?.contact_phone ?? '')
  const [bio, setBio] = useState(venue?.bio ?? '')
  const [logoUrl, setLogoUrl] = useState<string | null>(venue?.logo_url ?? null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(venue?.photo_url ?? null)
  const [mapUrl, setMapUrl] = useState<string | null>(venue?.venue_map_url ?? null)

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (contactEmail && !contactEmail.includes('@')) errs.contact_email = 'Enter a valid email'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload = {
      name: name.trim(),
      formatted_address: address.formatted_address?.trim() || null,
      address_line_1: address.address_line_1?.trim() || null,
      address_line_2: address.address_line_2?.trim() || null,
      city: address.city?.trim() || null,
      state_province: address.state_province?.trim() || null,
      country: address.country?.trim() || null,
      postal_code: address.postal_code?.trim() || null,
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null,
      timezone: timezone.trim() || null,
      website_url: websiteUrl.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      bio: bio.trim() || null,
      logo_url: logoUrl,
      photo_url: photoUrl,
      venue_map_url: mapUrl,
    }

    const mutation = isEditing ? updateVenue : createVenue

    mutation.mutate(payload, {
      onSuccess: (data) => {
        toast('success', isEditing ? 'Venue updated' : 'Venue created')
        navigate({ to: '/$sport/venues/$venueId', params: { sport: sportSlug, venueId: String(data.id) } })
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  return (
    <div>
      <Link
        to="/$sport/venues" params={{ sport: sportSlug }}
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Venues
      </Link>

      <h1 className="text-2xl font-bold text-(--color-text-primary) mb-6">
        {isEditing ? 'Edit Venue' : 'Create Venue'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <FormField label="Name" htmlFor="name" required error={errors.name}>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Venue name"
            error={!!errors.name}
          />
        </FormField>

        <AddressInput
          value={address}
          onChange={setAddress}
          label="Venue Address"
        />

        <FormField label="Timezone" htmlFor="timezone">
          <Select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option value="">Select timezone...</option>
            {US_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Website URL" htmlFor="website_url">
          <Input
            id="website_url"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://..."
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Contact Email" htmlFor="contact_email" error={errors.contact_email}>
            <Input
              id="contact_email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="info@venue.com"
              error={!!errors.contact_email}
            />
          </FormField>

          <FormField label="Contact Phone" htmlFor="contact_phone">
            <Input
              id="contact_phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ImageUpload
            value={logoUrl}
            onChange={setLogoUrl}
            label="Venue Logo"
          />
          <ImageUpload
            value={photoUrl}
            onChange={setPhotoUrl}
            label="Venue Photo"
          />
          <ImageUpload
            value={mapUrl}
            onChange={setMapUrl}
            label="Venue Map"
          />
        </div>

        <FormField label="Bio" htmlFor="bio">
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="About the venue..."
            rows={3}
          />
        </FormField>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={createVenue.isPending || updateVenue.isPending}>
            {isEditing ? 'Save Changes' : 'Create Venue'}
          </Button>
          <Link to="/$sport/venues" params={{ sport: sportSlug }}>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
