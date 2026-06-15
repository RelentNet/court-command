import { createFileRoute } from '@tanstack/react-router'
import { RefCourtView } from '../../../features/referee/RefCourtView'

export const Route = createFileRoute('/$sport/ref/courts/$courtId')({
  component: RefCourtPage,
})

function RefCourtPage() {
  const { courtId } = Route.useParams()
  return <RefCourtView courtId={Number(courtId)} />
}
