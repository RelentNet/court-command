import { createFileRoute } from '@tanstack/react-router'
import { AdminGuard } from '../../../features/admin/AdminGuard'
import { VenueApproval } from '../../../features/admin/VenueApproval'

export const Route = createFileRoute('/$sport/admin/venues')({
  component: () => (
    <AdminGuard>
      <VenueApproval />
    </AdminGuard>
  ),
})
