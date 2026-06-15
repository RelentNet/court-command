import { createFileRoute } from '@tanstack/react-router'
import { ScorekeeperMatchConsole } from '../../../features/scorekeeper/ScorekeeperMatchConsole'

export const Route = createFileRoute('/$sport/scorekeeper/matches/$publicId')({
  component: ScorekeeperMatchPage,
})

function ScorekeeperMatchPage() {
  const { publicId } = Route.useParams()
  return <ScorekeeperMatchConsole publicId={publicId} />
}
