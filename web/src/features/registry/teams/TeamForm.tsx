import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateTeam, useUpdateTeam, type Team } from './hooks'
import { useToast } from '../../../components/Toast'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { Textarea } from '../../../components/Textarea'
import { FormField } from '../../../components/FormField'
import { ImageUpload } from '../../../components/ImageUpload'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { useSport } from '../../../auth/SportContext'
interface TeamFormProps {
  team?: Team
}

export function TeamForm({ team }: TeamFormProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam(team ? String(team.id) : '')

  const isEditing = !!team

  const [name, setName] = useState(team?.name ?? '')
  const [shortName, setShortName] = useState(team?.short_name ?? '')
  const [primaryColor, setPrimaryColor] = useState(team?.primary_color ?? '#3b82f6')
  const [secondaryColor, setSecondaryColor] = useState(team?.secondary_color ?? '#64748b')
  const [city, setCity] = useState(team?.city ?? '')
  const [foundedYear, setFoundedYear] = useState(team?.founded_year ? String(team.founded_year) : '')
  const [bio, setBio] = useState(team?.bio ?? '')
  const [logoUrl, setLogoUrl] = useState<string | null>(team?.logo_url ?? null)

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (!shortName.trim()) errs.short_name = 'Short name is required'
    if (shortName.length > 4) errs.short_name = 'Short name must be 4 characters or fewer'
    if (foundedYear && (isNaN(Number(foundedYear)) || Number(foundedYear) < 1900))
      errs.founded_year = 'Enter a valid year'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload = {
      name: name.trim(),
      short_name: shortName.trim().toUpperCase(),
      primary_color: primaryColor || null,
      secondary_color: secondaryColor || null,
      city: city.trim() || null,
      founded_year: foundedYear ? Number(foundedYear) : null,
      bio: bio.trim() || null,
      logo_url: logoUrl,
    }

    const mutation = isEditing ? updateTeam : createTeam

    mutation.mutate(payload, {
      onSuccess: (data) => {
        toast('success', isEditing ? 'Team updated' : 'Team created')
        navigate({ to: '/$sport/teams/$teamId', params: { sport: sportSlug, teamId: String(data.id) } })
      },
      onError: (err) => toast('error', (err as Error).message),
    })
  }

  return (
    <div>
      <Link
        to="/$sport/teams" params={{ sport: sportSlug }}
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Teams
      </Link>

      <h1 className="text-2xl font-bold text-(--color-text-primary) mb-6">
        {isEditing ? 'Edit Team' : 'Create Team'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
        <FormField label="Name" htmlFor="name" required error={errors.name}>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name"
            error={!!errors.name}
          />
        </FormField>

        <FormField label="Short Name" htmlFor="short_name" required error={errors.short_name}>
          <Input
            id="short_name"
            value={shortName}
            onChange={(e) => setShortName(e.target.value.slice(0, 4))}
            placeholder="ABBR"
            maxLength={4}
            className="uppercase"
            error={!!errors.short_name}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Primary Color" htmlFor="primary_color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="primary_color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-12 rounded border border-(--color-border) cursor-pointer"
              />
              <span className="text-sm text-(--color-text-secondary)">{primaryColor}</span>
            </div>
          </FormField>

          <FormField label="Secondary Color" htmlFor="secondary_color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="secondary_color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-9 w-12 rounded border border-(--color-border) cursor-pointer"
              />
              <span className="text-sm text-(--color-text-secondary)">{secondaryColor}</span>
            </div>
          </FormField>
        </div>

        <FormField label="City" htmlFor="city">
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
          />
        </FormField>

        <FormField label="Founded Year" htmlFor="founded_year" error={errors.founded_year}>
          <Input
            id="founded_year"
            type="number"
            value={foundedYear}
            onChange={(e) => setFoundedYear(e.target.value)}
            placeholder="2024"
            min={1900}
            max={2100}
            error={!!errors.founded_year}
          />
        </FormField>

        <ImageUpload
          value={logoUrl}
          onChange={setLogoUrl}
          label="Team Logo"
        />

        <FormField label="Bio" htmlFor="bio">
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Team description..."
            rows={3}
          />
        </FormField>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={createTeam.isPending || updateTeam.isPending}>
            {isEditing ? 'Save Changes' : 'Create Team'}
          </Button>
          <Link to="/$sport/teams" params={{ sport: sportSlug }}>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
