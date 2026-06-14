import { createFileRoute } from '@tanstack/react-router'
import { PublicDivisionDetail } from '../../../features/public/PublicDivisionDetail'

export const Route = createFileRoute('/public/divisions/$divisionId')({
  component: DivisionDetailRoute,
})

function DivisionDetailRoute() {
  const { divisionId } = Route.useParams()
  return <PublicDivisionDetail divisionId={divisionId} />
}
