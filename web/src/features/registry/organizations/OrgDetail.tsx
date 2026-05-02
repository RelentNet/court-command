import { useState } from 'react'
import { useOrg, useDeleteOrg, useBlockOrg, useUnblockOrg, useOrgBlockStatus, useMyOrgRole } from './hooks'
import { useAuth } from '../../../auth/useAuth'
import { MembersPanel } from './MembersPanel'
import { OrgTeamsPanel } from './OrgTeamsPanel'
import { InfoRow } from '../../../components/InfoRow'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { useToast } from '../../../components/Toast'
import { ArrowLeft, Pencil, Trash2, ShieldBan, ShieldCheck } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { formatDate } from '../../../lib/formatters'
import { AdSlot } from '../../../components/AdSlot'

import { useSport } from '../../../auth/SportContext'
interface OrgDetailProps {
  orgId: string
}

export function OrgDetail({ orgId }: OrgDetailProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data: org, isLoading, error } = useOrg(orgId)
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const deleteOrg = useDeleteOrg(orgId)
  const blockOrg = useBlockOrg(orgId)
  const unblockOrg = useUnblockOrg(orgId)
  const { data: blockStatus } = useOrgBlockStatus(orgId)
  const { data: myRoleData } = useMyOrgRole(orgId)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)

  const isPlatformAdmin = user?.role === 'platform_admin'
  const myRole = myRoleData?.role ?? ''
  const isOrgAdmin = myRole === 'admin'
  const canManage = isPlatformAdmin || isOrgAdmin
  const isBlocked = blockStatus?.blocked ?? false

  if (isLoading) {
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
        action={
          <Link to="/$sport/organizations" params={{ sport: sportSlug }}>
            <Button variant="secondary">Back to Organizations</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div>
      <Link
        to="/$sport/organizations" params={{ sport: sportSlug }}
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Organizations
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">{org.name}</h1>
          <p className="text-sm text-(--color-text-secondary)">{org.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link to="/$sport/organizations/$orgId/edit" params={{ sport: sportSlug, orgId: String(org.id) }}>
              <Button variant="secondary" size="sm">
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </Link>
          )}
          {canManage && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
          {!canManage && user && (
            <Button
              variant={isBlocked ? 'secondary' : 'danger'}
              size="sm"
              onClick={() => setShowBlockConfirm(true)}
            >
              {isBlocked ? (
                <>
                  <ShieldCheck className="h-4 w-4 mr-1" />
                  Unblock
                </>
              ) : (
                <>
                  <ShieldBan className="h-4 w-4 mr-1" />
                  Block
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">Details</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Name" value={org.name} />
            <InfoRow label="Slug" value={org.slug} />
            <InfoRow label="Contact Email" value={org.contact_email} />
            <InfoRow label="Contact Phone" value={org.contact_phone} />
            <InfoRow
              label="Website"
              value={
                org.website_url ? (
                  <a
                    href={org.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    {org.website_url}
                  </a>
                ) : null
              }
            />
            <InfoRow
              label="Location"
              value={org.formatted_address || [org.city, org.state_province, org.country].filter(Boolean).join(', ')}
            />
            <InfoRow
              label="Founded"
              value={org.founded_year ? String(org.founded_year) : null}
            />
            <InfoRow label="Bio" value={org.bio} />
            <InfoRow label="Created" value={formatDate(org.created_at)} />
          </dl>
        </div>

        <OrgTeamsPanel orgId={orgId} canManage={canManage} />

        <MembersPanel orgId={orgId} canManage={canManage} />
      </div>

      <AdSlot size="medium-rectangle" slot="org-detail-bottom" className="mt-6" />

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteOrg.mutate(undefined, {
            onSuccess: () => {
              toast('success', 'Organization deleted')
              navigate({ to: '/$sport/organizations', params: { sport: sportSlug } })
            },
            onError: (err) => toast('error', (err as Error).message),
          })
        }}
        title="Delete Organization"
        message={`Are you sure you want to delete "${org.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteOrg.isPending}
      />

      <ConfirmDialog
        open={showBlockConfirm}
        onClose={() => setShowBlockConfirm(false)}
        onConfirm={() => {
          if (isBlocked) {
            unblockOrg.mutate(undefined, {
              onSuccess: () => {
                toast('success', 'Organization unblocked')
                setShowBlockConfirm(false)
              },
              onError: (err) => toast('error', (err as Error).message),
            })
          } else {
            blockOrg.mutate(undefined, {
              onSuccess: () => {
                toast('success', 'Organization blocked')
                setShowBlockConfirm(false)
              },
              onError: (err) => toast('error', (err as Error).message),
            })
          }
        }}
        title={isBlocked ? 'Unblock Organization' : 'Block Organization'}
        message={
          isBlocked
            ? `Unblock "${org.name}"? You will be able to receive invitations from them again.`
            : `Block "${org.name}"? You will leave any membership and won't receive future invitations.`
        }
        confirmText={isBlocked ? 'Unblock' : 'Block'}
        variant={isBlocked ? 'primary' : 'danger'}
        loading={blockOrg.isPending || unblockOrg.isPending}
      />
    </div>
  )
}
