import { createFileRoute } from '@tanstack/react-router'
import { ManageHub } from '../../../features/manage/ManageHub'

export const Route = createFileRoute('/$sport/manage/')({
  component: ManageHub,
})
