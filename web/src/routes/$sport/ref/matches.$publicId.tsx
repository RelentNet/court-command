import { createFileRoute } from '@tanstack/react-router'
import { RefMatchConsole } from '../../../features/referee/RefMatchConsole'

export const Route = createFileRoute('/$sport/ref/matches/$publicId')({
  component: RefMatchPage,
})

function RefMatchPage() {
  const { publicId } = Route.useParams()
  return <RefMatchConsole publicId={publicId} />
}
