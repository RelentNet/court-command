// web/tests/e2e/auth-flow.spec.ts
//
// Phase 3 happy-path smoke test. Validates:
//   /  ->  pick Pickleball  ->  Logto sign-in  ->  callback
//      ->  /pickleball/dashboard  ->  /pickleball/profile
//      ->  edit phone + save  ->  reload  ->  values persist
//
// Pre-conditions (must be running before this test):
//   - docker compose -f docker-compose.dev.yml up -d   (postgres+redis+logto)
//   - backend on :8080  (cd api && go build -o /tmp/cc-api . && /tmp/cc-api)
//   - frontend on :5173  (cd web && pnpm dev)
//   - Logto seeded with the bootstrap admin (make logto-seed)
//
// Bootstrap admin defaults to admin@courtcommand.local / TestPass123!
// (override via env vars E2E_LOGTO_EMAIL / E2E_LOGTO_PASS).
//
// Re-runnable: the test always FILLS phone with TEST_PHONE and asserts
// against the same value, so the assertion is order-independent
// regardless of prior runs' state in the player_profiles row.
//
// ----------------------------------------------------------------------
// Manual smoke checklist (out of E2E scope -- do these by hand for QA):
//   - OBS overlay still works while logged out:
//       visit /overlay/court/<some-slug> -- transparent bg, no auth bounce
//   - Public routes still public while logged out:
//       visit /public/tournaments -- no redirect, content renders
//   - Cross-sport prevention:
//       sign in to Pickleball, manually edit URL to /demo_sport/dashboard
//       -- SportGuard should bounce to / (sport picker) so user re-picks
//   - Sign-out:
//       click "Sign out" -- redirects to /, no auth on next request
//   - Mobile responsive:
//       open / on phone-sized viewport -- picker readable, buttons tappable
// ----------------------------------------------------------------------

import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_LOGTO_EMAIL || 'admin@courtcommand.local'
const ADMIN_PASS  = process.env.E2E_LOGTO_PASS  || 'TestPass123!'
// Use the current millisecond timestamp so consecutive runs always
// see a different value than what's stored, so the form's "No changes
// to save" path doesn't short-circuit the Save handler. The number
// fits 13 digits so it stays in the phone-field's expected range.
const TEST_PHONE  = `555-${Date.now() % 10000}`.padEnd(8, '0')

// Skip the whole file if the backend isn't reachable. A confusing
// locator timeout on the sport picker is much worse than a one-line
// "backend not running" skip message.
test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get('http://localhost:8080/api/v1/health')
    if (!res.ok()) {
      test.skip(true, `Backend health check returned ${res.status()} -- start the API on :8080 first`)
    }
  } catch {
    test.skip(true, 'Backend not reachable on :8080 -- start the API and Vite dev server before running this test')
  }
})

test('full auth flow: public landing -> sign in -> dashboard -> profile save', async ({ page }) => {
  // ----- Public landing -----
  // Anonymous visitors land on PublicLanding with the public hero
  // (sign-in CTA) + tournament/league/venue directories. No
  // auto-redirect to Logto for unauthenticated users -- public live
  // scores and tournaments must be visible without forcing auth.
  await page.goto('/')

  // PublicHero shows "Sign In to Get Started" when not authenticated.
  // Click it to start the OIDC flow. signIn(returnTo='/') will stash
  // '/' in sessionStorage; after callback we'll be back at root which
  // (for an authenticated single-sport user) auto-redirects to
  // /pickleball/dashboard.
  const signInBtn = page.getByRole('button', { name: /Sign In to Get Started/i })
  await expect(signInBtn).toBeVisible({ timeout: 10_000 })
  await signInBtn.click()

  // ----- Logto hosted sign-in (origin localhost:3001) -----
  await expect(page).toHaveURL(/localhost:3001/, { timeout: 15_000 })

  // Logto 1.22's sign-in flow may be split (email screen, then password
  // screen) or single-screen depending on the connector configuration.
  // Be defensive: try multiple selector strategies and click any
  // intermediate Continue button.
  //
  // If selectors below ever break after a Logto upgrade, run with
  //   pnpm e2e:headed
  // and inspect the DOM. Most likely culprits:
  //   - email/identifier input changed name/aria-label
  //   - password input no longer has type="password"
  //   - submit button text changed
  const emailField = page
    .locator('input[type="email"], input[name="identifier"], input[name="username"], input[name="email"]')
    .first()
  await emailField.waitFor({ state: 'visible', timeout: 10_000 })
  await emailField.fill(ADMIN_EMAIL)

  // Continue/Next is present on multi-screen flows, absent on single-screen.
  const continueBtn = page.getByRole('button', { name: /^(Continue|Next)$/i })
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click()
  }

  const passwordField = page.locator('input[type="password"]').first()
  await passwordField.waitFor({ state: 'visible', timeout: 10_000 })
  await passwordField.fill(ADMIN_PASS)

  await page
    .getByRole('button', { name: /^(Sign in|Continue|Submit|Log in)$/i })
    .first()
    .click()

  // ----- Callback -> public landing (auth'd shell) -----
  // Logto -> <origin>/auth/callback?code=...&state=... -> the callback
  // route exchanges the code, reads sessionStorage['logto_post_redirect']
  // (set to '/' by signIn before redirect), and navigates there.
  // After Phase 3.7+ tweaks (smoke 1.1/3.1), '/' renders PublicLanding
  // for authenticated users too -- no auto-redirect to dashboard.
  await expect(page).toHaveURL(/localhost:5173\/$/, { timeout: 25_000 })

  // Click "Dashboard" in the now-visible authenticated sidebar.
  await page.getByRole('link', { name: 'Dashboard' }).first().click()
  await expect(page).toHaveURL(/\/pickleball\/dashboard/, { timeout: 10_000 })

  // Assert the dashboard actually rendered with content -- not just
  // an empty Loading… stub. This proves the JWT-session bridge
  // populated session.Data so /api/v1/dashboard (which reads
  // session.SessionData inside the handler) returned 200 with data.
  // Phase 3.5 C1 verification: this is the smoking-gun assertion
  // that a JWT-authenticated user can hit a session-cookie-style
  // endpoint via the bridge.
  await expect(page.getByRole('heading', { name: /Welcome back,/ }))
    .toBeVisible({ timeout: 15_000 })

  // ----- Profile -----
  await page.goto('/pickleball/profile')
  await expect(page.getByRole('heading', { name: /Edit profile/i })).toBeVisible({ timeout: 10_000 })

  // Phone is in the Contact section. The form uses <FormField label="Phone"
  // htmlFor="phone"><Input id="phone" .../></FormField>, so
  // getByLabel('Phone') resolves to the input.
  const phoneInput = page.getByLabel(/^Phone$/, { exact: true }).first()
  await phoneInput.waitFor({ state: 'visible' })
  await phoneInput.fill(TEST_PHONE)

  // Save -- the Toast component renders [role=alert] with text
  // 'Profile saved' on success.
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: /Profile saved/i }))
    .toBeVisible({ timeout: 8_000 })

  // ----- Admin (Phase 3.6 C2 verify) -----
  // The bootstrap admin is platform_admin in Logto org-roles. The
  // bridge's elevatedRoleFromClaims promotes session.Data.Role from
  // 'player' (the local users.role default) to 'platform_admin' per
  // request based on claims.OrganizationRoles. AdminGuard separately
  // checks user.role from /api/v1/auth/me, which reads the local
  // users.role column.
  //
  // For this E2E both must align: the local row must say
  // platform_admin AND the JWT must carry the org-role. We assert
  // by visiting /pickleball/admin and looking for the dashboard
  // heading; if AdminGuard's role check fails, we'd be redirected
  // back to /pickleball/dashboard.
  await page.goto('/pickleball/admin')
  await expect(page.getByRole('heading', { name: /Admin Dashboard/i }))
    .toBeVisible({ timeout: 10_000 })

  // ----- Profile reload, value persists -----
  await page.goto('/pickleball/profile')
  await expect(page.getByLabel(/^Phone$/, { exact: true }).first())
    .toHaveValue(TEST_PHONE, { timeout: 10_000 })
})
