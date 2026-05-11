// web/src/features/admin/bypass.ts
//
// TEMP-ADMIN-BYPASS: single source of truth for whether the temporary
// platform_admin bypass is active. While ADMIN_BYPASS_ACTIVE is true,
// every authenticated user has full admin access at all three gates:
//
//   1. api/middleware/auth.go RequirePlatformAdmin
//   2. web/src/features/admin/AdminGuard.tsx
//   3. web/src/components/Sidebar.tsx (admin nav link visibility)
//
// Flipping this constant to false hides the warning banner, but does
// NOT restore the gates -- those are independent edits in the files
// above. To do a full revert:
//
//   git grep TEMP-ADMIN-BYPASS
//
// ...and follow the comments at every match site to restore the
// original role checks.
//
// This flag exists purely as a UI signal so the bypass cannot run
// silently in production. Keeping the constant + banner mounted on
// every authenticated page guarantees future-you (or anyone else)
// sees the warning immediately on every sign-in.

export const ADMIN_BYPASS_ACTIVE = true as const
