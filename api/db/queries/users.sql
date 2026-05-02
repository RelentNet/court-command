-- api/db/queries/users.sql

-- name: CreateUser :one
INSERT INTO users (
    email, password_hash, first_name, last_name, date_of_birth, display_name, role
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: CreateUnclaimedUser :one
INSERT INTO users (
    first_name, last_name, date_of_birth, password_hash, role, status
) VALUES (
    $1, $2, $3, '', 'player', 'unclaimed'
)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users
WHERE id = $1 AND deleted_at IS NULL;

-- name: GetUserByEmail :one
SELECT * FROM users
WHERE email = $1 AND deleted_at IS NULL;

-- name: GetUserByPublicID :one
SELECT * FROM users
WHERE public_id = $1 AND deleted_at IS NULL;

-- name: UpdateUser :one
UPDATE users SET
    first_name = COALESCE(sqlc.narg('first_name'), first_name),
    last_name = COALESCE(sqlc.narg('last_name'), last_name),
    display_name = COALESCE(sqlc.narg('display_name'), display_name),
    updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateUserStatus :one
UPDATE users SET
    status = $2,
    updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteUser :exec
UPDATE users SET
    deleted_at = now(),
    updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- name: ListUsers :many
SELECT * FROM users
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountUsers :one
SELECT count(*) FROM users
WHERE deleted_at IS NULL;

-- name: CheckDuplicateUser :one
SELECT count(*) FROM users
WHERE first_name = $1
  AND last_name = $2
  AND date_of_birth = $3
  AND status != 'merged'
  AND deleted_at IS NULL;

-- name: SearchUsers :many
SELECT * FROM users
WHERE deleted_at IS NULL
  AND (
    sqlc.narg('query')::TEXT IS NULL
    OR first_name ILIKE '%' || sqlc.narg('query')::TEXT || '%'
    OR last_name ILIKE '%' || sqlc.narg('query')::TEXT || '%'
    OR email ILIKE '%' || sqlc.narg('query')::TEXT || '%'
    OR public_id ILIKE '%' || sqlc.narg('query')::TEXT || '%'
  )
  AND (sqlc.narg('role')::TEXT IS NULL OR role = sqlc.narg('role')::TEXT)
  AND (sqlc.narg('status')::TEXT IS NULL OR status = sqlc.narg('status')::TEXT)
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountSearchUsers :one
SELECT count(*) FROM users
WHERE deleted_at IS NULL
  AND (
    sqlc.narg('query')::TEXT IS NULL
    OR first_name ILIKE '%' || sqlc.narg('query')::TEXT || '%'
    OR last_name ILIKE '%' || sqlc.narg('query')::TEXT || '%'
    OR email ILIKE '%' || sqlc.narg('query')::TEXT || '%'
    OR public_id ILIKE '%' || sqlc.narg('query')::TEXT || '%'
  )
  AND (sqlc.narg('role')::TEXT IS NULL OR role = sqlc.narg('role')::TEXT)
  AND (sqlc.narg('status')::TEXT IS NULL OR status = sqlc.narg('status')::TEXT);

-- name: UpdateUserRole :one
UPDATE users SET
    role = $2,
    updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;

-- name: UpdateUserPassword :one
UPDATE users
SET password_hash = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- ============================================================================
-- Logto integration (Phase 2 additive). The legacy queries above continue
-- to function for the cookie-session code path; the queries below let
-- new code resolve users by their Logto user ID without touching
-- password_hash / role.
-- ============================================================================

-- name: GetUserByLogtoUserID :one
SELECT * FROM users
WHERE logto_user_id = $1 AND deleted_at IS NULL;

-- name: SetUserLogtoUserID :one
-- Bind a Logto user ID to an existing local mirror row.
--
-- Behavior is "bind once, never change":
--   - Setting a value to the same logto_user_id is a no-op success
--     (idempotent).
--   - Setting a different value when one is already bound returns 0
--     rows affected (the WHERE filters it out); the caller surfaces
--     this as a 409 Conflict.
--   - The UNIQUE partial index idx_users_logto_user_id additionally
--     enforces that the same logto_user_id cannot bind to two
--     different local user rows.
--
-- The non-pointer @logto_user_id parameter (string, not *string)
-- prevents accidental NULL writes from a buggy caller. If a future
-- flow needs to clear a binding (e.g. account deletion), add a
-- separate ClearUserLogtoUserID query rather than reusing this one.
UPDATE users SET
    logto_user_id = @logto_user_id::TEXT,
    updated_at = now()
WHERE id = $1
  AND deleted_at IS NULL
  AND (logto_user_id IS NULL OR logto_user_id = @logto_user_id::TEXT)
RETURNING *;

-- name: CreateUserFromLogto :one
-- Used by webhooks/handler when Logto fires User.Created and we have
-- no local mirror yet. password_hash is NOT NULL on the table; we
-- write a sentinel '' string because Phase 6 will drop the column
-- entirely. role defaults via column default ('player').
--
-- date_of_birth is NOT NULL on the legacy schema and Logto does not
-- expose DOB on the user record. We seed with the SQL epoch sentinel
-- '1900-01-01'; users provide their real DOB when they fill out the
-- profile form (which writes to player_profiles.date_of_birth, the
-- forward-looking home for that field after the Phase 6 cutover).
INSERT INTO users (
    email, first_name, last_name, password_hash, date_of_birth,
    logto_user_id, status, role
)
VALUES (
    @email::TEXT, @first_name::TEXT, @last_name::TEXT, '',
    DATE '1900-01-01',
    @logto_user_id::TEXT, 'active', 'player'
)
RETURNING *;

-- name: UpdateUserFromLogto :one
-- Used by webhooks for User.Data.Updated. Updates email + display_name
-- (synthesizes from name) only. first_name/last_name stay as set at
-- creation; if Logto's name changes, the human re-edits here.
UPDATE users
SET
    email        = @email::TEXT,
    display_name = sqlc.narg('display_name'),
    updated_at   = now()
WHERE id = @id
RETURNING *;

-- name: SoftDeleteUserByLogtoUserID :exec
-- Used by webhooks for User.Deleted. Sets deleted_at; leaves the row
-- so referential integrity (e.g. tournaments.created_by) survives.
--
-- We deliberately do NOT change users.status here: the legacy CHECK
-- constraint accepts only ('active','suspended','banned','unclaimed',
-- 'merged'); soft-delete state is conveyed by deleted_at IS NOT NULL,
-- which every existing query already filters on. This matches the
-- pattern of SoftDeleteUser above.
UPDATE users
SET deleted_at = now(),
    updated_at = now()
WHERE logto_user_id = @logto_user_id::TEXT
  AND deleted_at IS NULL;
