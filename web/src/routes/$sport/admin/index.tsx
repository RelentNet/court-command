import { createFileRoute } from '@tanstack/react-router'
import { AdminGuard } from '../../../features/admin/AdminGuard'
import { AdminDashboard } from '../../../features/admin/AdminDashboard'

export const Route = createFileRoute('/$sport/admin/')({
  component: () => (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  ),
})
