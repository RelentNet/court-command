import { createFileRoute } from '@tanstack/react-router'
import { OrgList } from '../../../features/registry/organizations/OrgList'

export const Route = createFileRoute('/$sport/organizations/')({
  component: OrgList,
})
