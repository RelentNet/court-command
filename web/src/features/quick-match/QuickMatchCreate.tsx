// web/src/features/quick-match/QuickMatchCreate.tsx
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { FormField } from '../../components/FormField'
import { Input } from '../../components/Input'
import { Select } from '../../components/Select'
import { useToast } from '../../components/Toast'
import { useCreateQuickMatch } from './hooks'


import { useSport } from '../../auth/SportContext'
export function QuickMatchCreate() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const create = useCreateQuickMatch()

  const [scoringType, setScoringType] = useState<'side_out' | 'rally'>('side_out')
  const [pointsTo, setPointsTo] = useState('11')
  const [winBy, setWinBy] = useState('2')
  const [bestOf, setBestOf] = useState('1')

  function submit() {
    const setsToWin = Math.ceil((Number(bestOf) || 1) / 2)
    create.mutate(
      {
        games_per_set: 1,
        sets_to_win: setsToWin,
        points_to_win: Number(pointsTo) || 11,
        win_by: Number(winBy) || 2,
        rally_scoring: scoringType === 'rally',
      },
      {
        onSuccess: (m) => {
          toast('success', 'Quick match created')
          navigate({ to: '/$sport/ref/matches/$publicId', params: { sport: sportSlug, publicId: m.public_id } })
        },
        onError: (err) =>
          toast(
            'error',
            err instanceof Error ? err.message : 'Failed to create quick match',
          ),
      },
    )
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-(--color-text-primary) mb-1">
        New Quick Match
      </h1>
      <p className="text-sm text-(--color-text-secondary) mb-4">
        Casual scoring — no tournament required. Auto-deletes after 24 hours.
      </p>

      <Card className="flex flex-col gap-3">
        <FormField label="Scoring" htmlFor="qm-scoring">
          <Select
            id="qm-scoring"
            value={scoringType}
            onChange={(e) => setScoringType(e.target.value as 'side_out' | 'rally')}
          >
            <option value="side_out">Side-out</option>
            <option value="rally">Rally</option>
          </Select>
        </FormField>

        <div className="grid grid-cols-3 gap-2">
          <FormField label="Points to" htmlFor="qm-points">
            <Input
              id="qm-points"
              type="number"
              min={1}
              value={pointsTo}
              onChange={(e) => setPointsTo(e.target.value)}
            />
          </FormField>
          <FormField label="Win by" htmlFor="qm-winby">
            <Input
              id="qm-winby"
              type="number"
              min={1}
              value={winBy}
              onChange={(e) => setWinBy(e.target.value)}
            />
          </FormField>
          <FormField label="Best of" htmlFor="qm-bestof">
            <Input
              id="qm-bestof"
              type="number"
              min={1}
              value={bestOf}
              onChange={(e) => setBestOf(e.target.value)}
            />
          </FormField>
        </div>

        <div className="flex gap-2 justify-end mt-2">
          <Button
            variant="secondary"
            onClick={() => navigate({ to: '/$sport/quick-match', params: { sport: sportSlug } })}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>
            Create
          </Button>
        </div>
      </Card>
    </div>
  )
}
