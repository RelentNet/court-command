import { createFileRoute } from '@tanstack/react-router'
import { TeamList } from '../../../features/registry/teams/TeamList'

export const Route = createFileRoute('/$sport/teams/')({
  component: TeamList,
})
