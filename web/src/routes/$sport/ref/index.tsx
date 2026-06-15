import { createFileRoute } from '@tanstack/react-router'
import { RefHome } from '../../../features/referee/RefHome'

export const Route = createFileRoute('/$sport/ref/')({
  component: RefHome,
})
