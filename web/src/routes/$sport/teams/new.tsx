import { createFileRoute } from '@tanstack/react-router'
import { TeamForm } from '../../../features/registry/teams/TeamForm'

export const Route = createFileRoute('/$sport/teams/new')({
  component: TeamForm,
})
