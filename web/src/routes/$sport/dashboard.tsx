import { createFileRoute } from '@tanstack/react-router'
import { PlayerDashboard } from '../../features/dashboard/PlayerDashboard'

export const Route = createFileRoute('/$sport/dashboard')({
  component: PlayerDashboard,
})
