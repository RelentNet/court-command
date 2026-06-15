// web/src/features/admin/AdminBypassBanner.tsx
//
// TEMP-ADMIN-BYPASS: full-width red warning bar shown at the top of
// every authenticated page while ADMIN_BYPASS_ACTIVE is true. Hidden
// for anonymous visitors (they're not affected by the bypass) and
// automatically disappears once the constant is flipped to false.
//
// Visibility decision: shown on every authenticated page, not just
// admin routes. Rationale: a user who signed up but doesn't realize
// they have admin would never visit /admin, so a banner gated on
// AdminGuard would never warn them. The bar follows them everywhere
// while the bypass is live.
//
// Layout: position: sticky at top of viewport so it stays visible
// even when content scrolls. ~40px tall. Layouts in __root.tsx
// reserve top padding via the body-shift logic so the banner doesn't
// cover content.

import { ADMIN_BYPASS_ACTIVE } from './bypass'

interface AdminBypassBannerProps {
  /** When false, the banner is hidden even if ADMIN_BYPASS_ACTIVE
   *  is true. Used by the public layout to skip the banner for
   *  anonymous visitors. */
  visible: boolean
}

export function AdminBypassBanner({ visible }: AdminBypassBannerProps) {
  if (!ADMIN_BYPASS_ACTIVE || !visible) return null
  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-red-700 text-white text-center text-sm font-semibold px-4 py-2 shadow-md"
      style={{
        // Inline color overrides as a defense-in-depth measure: if
        // Tailwind's purge ever drops bg-red-700 because nothing else
        // references it, this guarantees the banner is still visibly
        // red. Same logic for the text color.
        backgroundColor: '#b91c1c',
        color: '#ffffff',
      }}
    >
      <span aria-hidden="true">⚠ </span>
      ADMIN BYPASS ACTIVE — every signed-in user has full admin access.
      Revert TEMP-ADMIN-BYPASS sites before production use.
    </div>
  )
}

/** ADMIN_BYPASS_BANNER_HEIGHT_PX is the height the banner consumes
 *  when rendered. Layouts in __root.tsx use this constant to add
 *  matching top padding to <main> so the banner doesn't cover
 *  content. Adjust together with the banner's py- class above. */
export const ADMIN_BYPASS_BANNER_HEIGHT_PX = 36
