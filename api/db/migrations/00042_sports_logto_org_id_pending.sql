-- +goose Up

-- ============================================================================
-- Replace migration 00041's hardcoded Logto org IDs with a 'pending-seed'
-- placeholder on any environment that still has them.
--
-- WHY: Logto org IDs are randomly generated when an org is created, so the
-- IDs that were correct for the developer who wrote 00041 (Pickleball =
-- 'ekup1zyrrxj4', Demo Sport = '7866ex96uk6b') are stale on every fresh
-- Logto tenant. The SPA requests org-scoped tokens via
-- getAccessToken(resource, sport.logto_org_id); when that org ID doesn't
-- exist on the tenant, Logto silently issues a resource-only token instead
-- of failing. The token then has no `organization_roles` claim, the api's
-- claims.ElevatedRole() returns "", and the user sees their underlying DB
-- role ('player') with no admin link in the sidebar -- even when they have
-- platform_admin assigned in Logto Console.
--
-- WHAT THIS DOES: Only rewrites rows that still hold the original 00041
-- hardcoded values. Any environment that has already run the bootstrap
-- seeder (api/cmd/logto-seed) -- which calls syncSportsOrgIDs to push the
-- real Logto IDs into this table -- has different values in those columns
-- and is left untouched. After this migration, fresh installs see
-- 'pending-seed' and the api's startup verification (api/startup/
-- verify_sports.go) refuses to boot in production until the seeder has run
-- and replaced the placeholders with real Logto org IDs.
-- ============================================================================

UPDATE sports
SET    logto_org_id = 'pending-seed'
WHERE  logto_org_id IN ('ekup1zyrrxj4', '7866ex96uk6b');

-- +goose Down

-- Restoring stale IDs would be actively harmful (they don't exist on any
-- real Logto tenant). Down is intentionally a no-op; rolling back this
-- migration leaves the columns at whatever value the seeder put there.
SELECT 1;
