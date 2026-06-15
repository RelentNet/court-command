import { createFileRoute } from '@tanstack/react-router'
import { QuickMatchList } from '../../../features/quick-match/QuickMatchList'

export const Route = createFileRoute('/$sport/quick-match/')({
  component: QuickMatchList,
})
