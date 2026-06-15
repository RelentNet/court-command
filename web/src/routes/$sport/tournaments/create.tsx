import { createFileRoute } from '@tanstack/react-router'
import { TournamentCreate } from '../../../features/tournaments/TournamentCreate'

export const Route = createFileRoute('/$sport/tournaments/create')({
  component: TournamentCreate,
})
