// TODO: deleted in Phase 3 Task 6
// This page is replaced by Logto's hosted sign-up flow (signIn() in
// useAuth automatically routes new users through Logto registration).
// Stubbed during Task 2 to keep the build passing until Task 6 removes
// the file outright.
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <p className="mb-4">This page has been removed.</p>
        <Link to="/" className="text-cyan-400 hover:text-cyan-300 font-medium">Go home</Link>
      </div>
    </div>
  )
}
