import { createFileRoute } from '@tanstack/react-router'
import { LeagueList } from '../../../features/leagues/LeagueList'

export const Route = createFileRoute('/$sport/leagues/')({
  component: LeagueList,
})
