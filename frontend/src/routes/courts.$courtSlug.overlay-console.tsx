import { createFileRoute } from '@tanstack/react-router'
import { OverlayConsole } from '../components/OverlayConsole/OverlayConsole'

export const Route = createFileRoute('/courts/$courtSlug/overlay-console')({
  component: CourtOverlayConsole,
})

function CourtOverlayConsole() {
  const { courtSlug } = Route.useParams()
  return <OverlayConsole courtSlug={courtSlug} />
}
