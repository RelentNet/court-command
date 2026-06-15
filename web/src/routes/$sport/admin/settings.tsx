import { createFileRoute } from '@tanstack/react-router'
import { AdminGuard } from '../../../features/admin/AdminGuard'
import { AdminSettings } from '../../../features/admin/AdminSettings'

export const Route = createFileRoute('/$sport/admin/settings')({
  component: () => (
    <AdminGuard>
      <AdminSettings />
    </AdminGuard>
  ),
})
