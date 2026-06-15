import { createFileRoute } from '@tanstack/react-router'
import { AdminGuard } from '../../../../features/admin/AdminGuard'
import { UserDetail } from '../../../../features/admin/UserDetail'

function UserDetailRoute() {
  const { userId } = Route.useParams()
  return (
    <AdminGuard>
      <UserDetail userId={userId} />
    </AdminGuard>
  )
}

export const Route = createFileRoute('/$sport/admin/users/$userId')({
  component: UserDetailRoute,
})
