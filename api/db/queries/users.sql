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
-- Bind a Logto user ID to an existing local mirror row. Idempotent:
-- setting the same value twice is fine; setting a different value
-- when one is already bound fails on the partial UNIQUE index
-- idx_users_logto_user_id (the caller surfaces this as a 409).
UPDATE users SET
    logto_user_id = $2,
    updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;
