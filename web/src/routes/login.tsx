// TODO: deleted in Phase 3 Task 6
// This page is replaced by the OIDC sign-in flow (signIn() in useAuth).
// Stubbed during Task 2 to keep the build passing until Task 6 removes
// the file outright.
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || '/',
  }),
})

function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <p className="mb-4">This page has been removed.</p>
        <Link to="/" className="text-cyan-400 hover:text-cyan-300 font-medium">Go home</Link>
      </div>
    </div>
  )
}
