import { type ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '../../auth/useAuth'
import { Skeleton } from '../../components/Skeleton'

interface AdminGuardProps {
  children: ReactNode
}

export function AdminGuard({ children }: AdminGuardProps) {
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

  if (user?.role !== 'platform_admin') {
    return <Navigate to="/dashboard" />
  }

  return <>{children}</>
}
