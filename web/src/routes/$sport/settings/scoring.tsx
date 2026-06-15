import { createFileRoute } from '@tanstack/react-router'
import { ScoringSettings } from '../../../features/scoring/ScoringSettings'

export const Route = createFileRoute('/$sport/settings/scoring')({
  component: ScoringSettings,
})
