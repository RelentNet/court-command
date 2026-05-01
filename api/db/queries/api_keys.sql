-- name: CreateApiKey :one
INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetApiKeyByHash :one
SELECT * FROM api_keys
WHERE key_hash = $1 AND is_active = true;

-- name: GetApiKeyByID :one
SELECT * FROM api_keys WHERE id = $1;

-- name: ListApiKeysByUser :many
SELECT * FROM api_keys
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: UpdateApiKeyLastUsed :exec
UPDATE api_keys SET last_used_at = now()
WHERE id = $1;

-- name: DeactivateApiKey :exec
UPDATE api_keys SET is_active = false, updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: CountApiKeysByUser :one
SELECT count(*) FROM api_keys
WHERE user_id = $1 AND is_active = true;

-- ============================================================================
-- Logto M2M integration (Phase 2 additive). Phase 4 will rewrite
-- CreateApiKey to delegate to logto.CreateM2MApp and persist the
-- mirror row with logto_m2m_app_id; until then the legacy bcrypt
-- key path keeps working.
-- ============================================================================

-- name: GetAPIKeyByLogtoM2MAppID :one
-- Admin / management lookup by Logto M2M app ID. Does NOT filter on
-- is_active because admin tools (Phase 4 webhook handlers, deactivation
-- flows, audit trails) need to find rows regardless of state. The hot
-- request-auth path uses GetActiveAPIKeyByLogtoM2MAppID instead.
SELECT * FROM api_keys WHERE logto_m2m_app_id = $1;

-- name: GetActiveAPIKeyByLogtoM2MAppID :one
-- Request-auth lookup: only returns the row if it is active. Mirrors
-- the GetApiKeyByHash semantics on the legacy code path.
SELECT * FROM api_keys
WHERE logto_m2m_app_id = $1 AND is_active = true;

-- name: SetAPIKeyLogtoM2MAppID :one
UPDATE api_keys SET
    logto_m2m_app_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;
