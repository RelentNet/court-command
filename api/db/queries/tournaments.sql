-- name: CreateTournament :one
INSERT INTO tournaments (
    name, slug, status, start_date, end_date, venue_id, league_id, season_id,
    description, logo_url, banner_url, contact_email, contact_phone, website_url,
    registration_open_at, registration_close_at, max_participants,
    rules_document_url, social_links, notes, sponsor_info,
    show_registrations, created_by_user_id, td_user_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
) RETURNING *;

-- name: GetTournamentByID :one
SELECT * FROM tournaments WHERE id = $1 AND deleted_at IS NULL;

-- name: GetTournamentBySlug :one
SELECT * FROM tournaments WHERE slug = $1 AND deleted_at IS NULL;

-- name: GetTournamentByPublicID :one
SELECT * FROM tournaments WHERE public_id = $1 AND deleted_at IS NULL;

-- name: ListTournaments :many
SELECT * FROM tournaments
WHERE deleted_at IS NULL
ORDER BY start_date DESC
LIMIT $1 OFFSET $2;

-- name: CountTournaments :one
SELECT COUNT(*) FROM tournaments WHERE deleted_at IS NULL;

-- name: ListTournamentsByLeague :many
SELECT * FROM tournaments
WHERE league_id = $1 AND deleted_at IS NULL
ORDER BY start_date DESC
LIMIT $2 OFFSET $3;

-- name: CountTournamentsByLeague :one
SELECT COUNT(*) FROM tournaments
WHERE league_id = $1 AND deleted_at IS NULL;

-- name: ListTournamentsBySeason :many
SELECT * FROM tournaments
WHERE season_id = $1 AND deleted_at IS NULL
ORDER BY start_date ASC;

-- name: ListTournamentsByCreator :many
SELECT * FROM tournaments
WHERE (created_by_user_id = $1 OR td_user_id = $1) AND deleted_at IS NULL
ORDER BY start_date DESC
LIMIT $2 OFFSET $3;

-- name: CountTournamentsByCreator :one
SELECT COUNT(*) FROM tournaments
WHERE (created_by_user_id = $1 OR td_user_id = $1) AND deleted_at IS NULL;

-- name: SearchTournaments :many
SELECT * FROM tournaments
WHERE deleted_at IS NULL
  AND (
    name ILIKE '%' || @search_term::TEXT || '%'
    OR description ILIKE '%' || @search_term::TEXT || '%'
  )
ORDER BY start_date DESC
LIMIT $1 OFFSET $2;

-- name: CountSearchTournaments :one
SELECT COUNT(*) FROM tournaments
WHERE deleted_at IS NULL
  AND (
    name ILIKE '%' || @search_term::TEXT || '%'
    OR description ILIKE '%' || @search_term::TEXT || '%'
  );

-- name: UpdateTournament :one
UPDATE tournaments SET
    name = COALESCE(sqlc.narg('name'), name),
    slug = COALESCE(sqlc.narg('slug'), slug),
    status = COALESCE(sqlc.narg('status'), status),
    start_date = COALESCE(sqlc.narg('start_date'), start_date),
    end_date = COALESCE(sqlc.narg('end_date'), end_date),
    venue_id = COALESCE(sqlc.narg('venue_id'), venue_id),
    league_id = COALESCE(sqlc.narg('league_id'), league_id),
    season_id = COALESCE(sqlc.narg('season_id'), season_id),
    description = COALESCE(sqlc.narg('description'), description),
    logo_url = COALESCE(sqlc.narg('logo_url'), logo_url),
    banner_url = COALESCE(sqlc.narg('banner_url'), banner_url),
    contact_email = COALESCE(sqlc.narg('contact_email'), contact_email),
    contact_phone = COALESCE(sqlc.narg('contact_phone'), contact_phone),
    website_url = COALESCE(sqlc.narg('website_url'), website_url),
    registration_open_at = COALESCE(sqlc.narg('registration_open_at'), registration_open_at),
    registration_close_at = COALESCE(sqlc.narg('registration_close_at'), registration_close_at),
    max_participants = COALESCE(sqlc.narg('max_participants'), max_participants),
    rules_document_url = COALESCE(sqlc.narg('rules_document_url'), rules_document_url),
    cancellation_reason = COALESCE(sqlc.narg('cancellation_reason'), cancellation_reason),
    social_links = COALESCE(sqlc.narg('social_links'), social_links),
    notes = COALESCE(sqlc.narg('notes'), notes),
    sponsor_info = COALESCE(sqlc.narg('sponsor_info'), sponsor_info),
    show_registrations = COALESCE(sqlc.narg('show_registrations'), show_registrations),
    td_user_id = COALESCE(sqlc.narg('td_user_id'), td_user_id),
    updated_at = NOW()
WHERE id = @id AND deleted_at IS NULL
RETURNING *;

-- name: GetTournamentsByIDs :many
SELECT * FROM tournaments
WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL;

-- name: SoftDeleteTournament :exec
UPDATE tournaments SET deleted_at = NOW(), updated_at = NOW()
WHERE id = $1 AND deleted_at IS NULL;

-- name: SlugExistsTournament :one
SELECT EXISTS(SELECT 1 FROM tournaments WHERE slug = $1 AND deleted_at IS NULL);

-- name: ListTournamentsByStatus :many
SELECT * FROM tournaments
WHERE status = $1 AND deleted_at IS NULL
ORDER BY start_date ASC
LIMIT $2 OFFSET $3;

-- name: CountTournamentsByStatus :one
SELECT COUNT(*) FROM tournaments
WHERE status = $1 AND deleted_at IS NULL;

-- name: ListPublicTournaments :many
-- Public directory listing: filters to publicly-visible statuses in SQL so
-- LIMIT/OFFSET and the matching count are computed over the same filtered set.
SELECT * FROM tournaments
WHERE deleted_at IS NULL AND status = ANY($1::text[])
ORDER BY start_date DESC
LIMIT $2 OFFSET $3;

-- name: CountPublicTournaments :one
SELECT COUNT(*) FROM tournaments
WHERE deleted_at IS NULL AND status = ANY($1::text[]);

-- name: SearchTournamentsByStatus :many
SELECT * FROM tournaments
WHERE deleted_at IS NULL
  AND status = @status::TEXT
  AND (
    name ILIKE '%' || @search_term::TEXT || '%'
    OR description ILIKE '%' || @search_term::TEXT || '%'
  )
ORDER BY start_date DESC
LIMIT $1 OFFSET $2;

-- name: CountSearchTournamentsByStatus :one
SELECT COUNT(*) FROM tournaments
WHERE deleted_at IS NULL
  AND status = @status::TEXT
  AND (
    name ILIKE '%' || @search_term::TEXT || '%'
    OR description ILIKE '%' || @search_term::TEXT || '%'
  );
