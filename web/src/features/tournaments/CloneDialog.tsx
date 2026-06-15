import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCloneTournament, type Tournament } from './hooks'
import { useToast } from '../../components/Toast'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { FormField } from '../../components/FormField'
import { Input } from '../../components/Input'
import { DateInput } from '../../components/DateInput'

import { useSport } from '../../auth/SportContext'
interface CloneDialogProps {
  tournament: Tournament
  open: boolean
  onClose: () => void
}

export function CloneDialog({ tournament, open, onClose }: CloneDialogProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const cloneMutation = useCloneTournament(String(tournament.id))

  const [name, setName] = useState(`Copy of ${tournament.name}`)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  async function handleClone() {
    if (!name.trim()) {
      toast('error', 'Name is required')
      return
    }
    try {
      const payload: { name: string; start_date?: string; end_date?: string } = {
        name: name.trim(),
      }
      if (startDate) payload.start_date = startDate
      if (endDate) payload.end_date = endDate
      const cloned = await cloneMutation.mutateAsync(payload)
      toast('success', 'Tournament cloned successfully')
      onClose()
      navigate({
        to: '/$sport/tournaments/$tournamentId',
        params: { sport: sportSlug, tournamentId: String(cloned.id) },
      })
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Clone Tournament">
      <div className="space-y-4">
        <FormField label="New Tournament Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tournament name"
          />
        </FormField>
        <FormField label="Start Date">
          <DateInput
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </FormField>
        <FormField label="End Date">
          <DateInput
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleClone} loading={cloneMutation.isPending}>
            Clone
          </Button>
        </div>
      </div>
    </Modal>
  )
}
