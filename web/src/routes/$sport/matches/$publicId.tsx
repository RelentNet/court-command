import { createFileRoute } from '@tanstack/react-router'
import { MatchDetail } from '../../../features/matches/MatchDetail'

export const Route = createFileRoute('/$sport/matches/$publicId')({
  component: MatchDetailPage,
})

function MatchDetailPage() {
  const { publicId } = Route.useParams()
  return <MatchDetail publicId={publicId} />
}
