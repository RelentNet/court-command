import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { type Division } from './hooks'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { Modal } from '../../components/Modal'
import { DivisionForm } from './DivisionForm'
import { Layers, Plus } from 'lucide-react'

import { useSport } from '../../auth/SportContext'
interface DivisionListProps {
  tournamentId: string
  divisions: Division[]
}

function formatBracket(bracket: string): string {
  return bracket.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function DivisionList({ tournamentId, divisions }: DivisionListProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [createOpen, setCreateOpen] = useState(false)

  if (divisions.length === 0 && !createOpen) {
    return (
      <EmptyState
        icon={<Layers className="h-12 w-12" />}
        title="No divisions yet"
        description="Create your first division to start setting up the tournament bracket."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Division
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-(--color-text-secondary)">
          {divisions.length} division{divisions.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Division
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {divisions.map((div) => (
          <Link
            key={div.id}
            to="/$sport/tournaments/$tournamentId/divisions/$divisionId"
            params={{ sport: sportSlug, tournamentId, divisionId: String(div.id) }}
            className="block"
          >
            <Card className="h-full hover:border-cyan-500/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-(--color-text-primary)">
                  {div.name}
                </h3>
                <StatusBadge status={div.status} type="division" />
              </div>
              <div className="space-y-1 text-sm text-(--color-text-secondary)">
                <p>Format: {div.format}</p>
                <p>Bracket: {formatBracket(div.bracket_format)}</p>
                {div.max_teams && <p>Max teams: {div.max_teams}</p>}
                {div.entry_fee_amount !== null && div.entry_fee_amount > 0 && (
                  <p>
                    Entry fee: ${div.entry_fee_amount} {div.entry_fee_currency}
                  </p>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Division"
        className="max-w-2xl"
      >
        <DivisionForm
          tournamentId={tournamentId}
          onSuccess={() => setCreateOpen(false)}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>
    </div>
  )
}
