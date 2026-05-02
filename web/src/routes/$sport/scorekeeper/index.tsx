import { createFileRoute } from '@tanstack/react-router'
import { ScorekeeperHome } from '../../../features/scorekeeper/ScorekeeperHome'

export const Route = createFileRoute('/$sport/scorekeeper/')({
  component: ScorekeeperHome,
})
