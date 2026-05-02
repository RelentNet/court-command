import { createFileRoute } from '@tanstack/react-router'
import { PlayerForm } from '../../features/registry/players/PlayerForm'

export const Route = createFileRoute('/$sport/profile')({
  component: PlayerForm,
})
