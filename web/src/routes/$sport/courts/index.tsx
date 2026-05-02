import { createFileRoute } from '@tanstack/react-router'
import { CourtList } from '../../../features/registry/courts/CourtList'

export const Route = createFileRoute('/$sport/courts/')({
  component: CourtList,
})
