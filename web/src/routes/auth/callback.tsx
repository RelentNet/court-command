// web/src/routes/auth/callback.tsx
//
// OIDC sign-in callback handler.
//
// When the user signs in via Logto, the IdP redirects the browser to
// <origin>/auth/callback?code=...&state=.... The Logto SDK's
// useHandleSignInCallback hook reads window.location, exchanges the
// code for a token, and then fires the onComplete callback.
//
// Post-auth redirect target is persisted by useAuth.signIn() in
// sessionStorage (under key 'logto_post_redirect'); we read+clear it
// in the onComplete callback and navigate there. Falls back to '/'.
//
// This route MUST be rendered without the app shell (no Sidebar /
// AuthGuard). __root.tsx's NO_SHELL_ROUTES already includes
// '/auth/callback'.

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useHandleSignInCallback } from '@logto/react'
import { consumePostAuthTarget } from '../../auth/useAuth'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const navigate = useNavigate()

  // useHandleSignInCallback fires the SDK's token exchange exactly once
  // (StrictMode-safe — the SDK guards against double invocation of the
  // /token endpoint with the same authorization code). The callback
  // runs after the token is in the SDK's internal cache.
  const { isLoading } = useHandleSignInCallback(() => {
    const target = consumePostAuthTarget()
    void navigate({ to: target })
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-lg font-medium">Completing sign-in…</div>
          <div className="mt-1 text-sm text-gray-500">One moment.</div>
        </div>
      </div>
    )
  }

  // Once isLoading flips to false, the navigate() in the callback has
  // already fired and we're on our way out. Render nothing in the
  // brief window before the navigation takes effect.
  return null
}
