import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { OrgForm } from '../../../features/registry/organizations/OrgForm'
import { useOrg, useMyOrgRole } from '../../../features/registry/organizations/hooks'
import { useAuth } from '../../../auth/useAuth'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { Button } from '../../../components/Button'

import { useSport } from '../../../auth/SportContext'
export const Route = createFileRoute('/$sport/organizations/$orgId_/edit')({
  component: OrgEditPage,
})

function OrgEditPage() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { orgId } = Route.useParams()
  const { data: org, isLoading, error } = useOrg(orgId)
  const { user } = useAuth()
  const { data: myRoleData, isLoading: roleLoading } = useMyOrgRole(orgId)
  const navigate = useNavigate()

  const isPlatformAdmin = user?.role === 'platform_admin'
  const isOrgAdmin = myRoleData?.role === 'admin'
  const canEdit = isPlatformAdmin || isOrgAdmin

  if (isLoading || roleLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !org) {
    return (
      <EmptyState
        title="Organization not found"
        description="This organization may have been removed or you don't have access."
      />
    )
  }

  if (!canEdit) {
    return (
      <EmptyState
        title="Access denied"
        description="You must be an organization admin to edit this organization."
        action={
          <Button variant="secondary" onClick={() => navigate({ to: '/$sport/organizations/$orgId', params: { sport: sportSlug, orgId } })}>
            Back to Organization
          </Button>
        }
      />
    )
  }

  return <OrgForm org={org} />
}
