import { createFileRoute } from '@tanstack/react-router'
import { VenueForm } from '../../../features/registry/venues/VenueForm'

export const Route = createFileRoute('/$sport/venues/new')({
  component: VenueForm,
})
