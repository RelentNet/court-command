import { createFileRoute } from '@tanstack/react-router'
import { AdminGuard } from '../../../features/admin/AdminGuard'
import { AdManager } from '../../../features/admin/AdManager'

export const Route = createFileRoute('/$sport/admin/ads')({
  component: () => (
    <AdminGuard>
      <AdManager />
    </AdminGuard>
  ),
})
