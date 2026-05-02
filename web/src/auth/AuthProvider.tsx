// web/src/auth/AuthProvider.tsx
//
// Top-level auth provider. Wraps the entire app in <LogtoProvider>.
// Doesn't contain its own state; the actual auth-related hooks live in
// useAuth.ts.

import { LogtoProvider } from '@logto/react'
import type { ReactNode } from 'react'
import { logtoConfig } from './LogtoConfig'

export function AuthProvider({ children }: { children: ReactNode }) {
  return <LogtoProvider config={logtoConfig}>{children}</LogtoProvider>
}
