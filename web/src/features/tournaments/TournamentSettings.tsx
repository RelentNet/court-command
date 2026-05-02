import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useUpdateTournament,
  useDeleteTournament,
  type Tournament,
} from './hooks'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { FormField } from '../../components/FormField'
import { Input } from '../../components/Input'
import { DateInput } from '../../components/DateInput'
import { Textarea } from '../../components/Textarea'
import { ImageUpload } from '../../components/ImageUpload'
import { SponsorEditor } from '../../components/SponsorEditor'
import { VenuePicker } from '../../components/VenuePicker'
import { ConfirmDialog } from '../../components/ConfirmDialog'

import { useSport } from '../../auth/SportContext'
interface TournamentSettingsProps {
  tournament: Tournament
  tournamentId: string
}

export function TournamentSettings({
  tournament,
  tournamentId,
}: TournamentSettingsProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const updateMutation = useUpdateTournament(tournamentId)
  const deleteMutation = useDeleteTournament(tournamentId)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [form, setForm] = useState({
    name: tournament.name,
    slug: tournament.slug,
    start_date: tournament.start_date?.slice(0, 10) ?? '',
    end_date: tournament.end_date?.slice(0, 10) ?? '',
    venue_id: tournament.venue_id,
    description: tournament.description ?? '',
    contact_email: tournament.contact_email ?? '',
    contact_phone: tournament.contact_phone ?? '',
    website_url: tournament.website_url ?? '',
    rules_document_url: tournament.rules_document_url ?? '',
    logo_url: tournament.logo_url,
    banner_url: tournament.banner_url,
    sponsor_info: tournament.sponsor_info ?? [],
    max_participants: tournament.max_participants,
    show_registrations: tournament.show_registrations,
  })

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    try {
      await updateMutation.mutateAsync({
        name: form.name,
        slug: form.slug,
        start_date: form.start_date,
        end_date: form.end_date,
        venue_id: form.venue_id,
        description: form.description || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        website_url: form.website_url || null,
        rules_document_url: form.rules_document_url || null,
        logo_url: form.logo_url,
        banner_url: form.banner_url,
        sponsor_info: form.sponsor_info.length > 0 ? form.sponsor_info : null,
        max_participants: form.max_participants,
        show_registrations: form.show_registrations,
      })
      toast('success', 'Tournament updated')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync()
      toast('success', 'Tournament deleted')
      navigate({ to: '/$sport/tournaments', params: { sport: sportSlug } })
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          General
        </h2>
        <div className="space-y-4">
          <FormField label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Tournament name"
            />
          </FormField>
          <FormField label="Slug">
            <Input
              value={form.slug}
              onChange={(e) => updateField('slug', e.target.value)}
              placeholder="tournament-slug"
            />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Start Date" required>
              <DateInput
                value={form.start_date}
                onChange={(e) => updateField('start_date', e.target.value)}
              />
            </FormField>
            <FormField label="End Date" required>
              <DateInput
                value={form.end_date}
                onChange={(e) => updateField('end_date', e.target.value)}
              />
            </FormField>
          </div>
          <FormField label="Venue">
            <VenuePicker
              value={form.venue_id}
              onChange={(id) => updateField('venue_id', id)}
            />
          </FormField>
          <FormField label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Tournament description..."
              rows={4}
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          Contact
        </h2>
        <div className="space-y-4">
          <FormField label="Contact Email">
            <Input
              type="email"
              value={form.contact_email}
              onChange={(e) => updateField('contact_email', e.target.value)}
              placeholder="contact@example.com"
            />
          </FormField>
          <FormField label="Contact Phone">
            <Input
              type="tel"
              value={form.contact_phone}
              onChange={(e) => updateField('contact_phone', e.target.value)}
              placeholder="(555) 123-4567"
            />
          </FormField>
          <FormField label="Website URL">
            <Input
              type="url"
              value={form.website_url}
              onChange={(e) => updateField('website_url', e.target.value)}
              placeholder="https://..."
            />
          </FormField>
          <FormField label="Rules Document URL">
            <Input
              type="url"
              value={form.rules_document_url}
              onChange={(e) =>
                updateField('rules_document_url', e.target.value)
              }
              placeholder="https://..."
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          Media
        </h2>
        <div className="space-y-4">
          <ImageUpload
            value={form.logo_url}
            onChange={(url) => updateField('logo_url', url)}
            label="Logo"
          />
          <ImageUpload
            value={form.banner_url}
            onChange={(url) => updateField('banner_url', url)}
            label="Banner"
          />
        </div>
      </Card>

      <Card>
        <SponsorEditor
          value={form.sponsor_info}
          onChange={(sponsors) => updateField('sponsor_info', sponsors)}
        />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          Registration Settings
        </h2>
        <div className="space-y-4">
          <FormField label="Max Participants">
            <Input
              type="number"
              value={form.max_participants ?? ''}
              onChange={(e) =>
                updateField(
                  'max_participants',
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              placeholder="No limit"
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm text-(--color-text-primary)">
            <input
              type="checkbox"
              checked={form.show_registrations}
              onChange={(e) =>
                updateField('show_registrations', e.target.checked)
              }
              className="rounded"
            />
            Show registrations publicly
          </label>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button onClick={handleSave} loading={updateMutation.isPending}>
          Save Changes
        </Button>
        <Button
          variant="danger"
          onClick={() => setDeleteOpen(true)}
        >
          Delete Tournament
        </Button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Tournament"
        message="Are you sure you want to delete this tournament? This action is permanent and cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
