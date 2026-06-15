import { createFileRoute } from '@tanstack/react-router'
import { AdminGuard } from '../../../../features/admin/AdminGuard'
import { UserSearch } from '../../../../features/admin/UserSearch'

export const Route = createFileRoute('/$sport/admin/users/')({
  component: () => (
    <AdminGuard>
      <UserSearch />
    </AdminGuard>
  ),
})
