import { type ReactNode } from 'react'
// TEMP-ADMIN-BYPASS: Navigate is unused while the role check is disabled.
// Re-import it when restoring: import { Navigate } from '@tanstack/react-router'
import { useAuth } from '../../auth/useAuth'
import { Skeleton } from '../../components/Skeleton'

import { useSport } from '../../auth/SportContext'
interface AdminGuardProps {
  children: ReactNode
}

export function AdminGuard({ children }: AdminGuardProps) {
  // TEMP-ADMIN-BYPASS: platform_admin check disabled while debugging the
  // Logto organization_roles plumbing. Any authenticated user can reach
  // every admin route. To restore: uncomment the role gate below and
  // remove this comment block. See api/middleware/auth.go for the
  // matching backend bypass; both must be reverted together.
  // git grep TEMP-ADMIN-BYPASS to find every site.
  const { sport: _sport } = useSport()
  // const sportSlug = _sport?.slug ?? ''

  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="space-y-4 w-full max-w-md p-8">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  // TEMP-ADMIN-BYPASS: still require an authenticated user (don't expose
  // admin to anonymous visitors) but accept any role. Original check:
  //
  // if (user?.role !== 'platform_admin') {
  //   return <Navigate to="/$sport/dashboard" params={{ sport: sportSlug }} />
  // }
  if (!user) {
    return null
  }

  return <>{children}</>
}
