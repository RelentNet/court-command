import { createFileRoute } from '@tanstack/react-router'
import { PlayerList } from '../../../features/registry/players/PlayerList'

export const Route = createFileRoute('/$sport/players/')({
  component: PlayerList,
})
