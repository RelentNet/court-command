import { createFileRoute } from '@tanstack/react-router'
import { LeagueCreate } from '../../../features/leagues/LeagueCreate'

export const Route = createFileRoute('/$sport/leagues/create')({
  component: LeagueCreate,
})
