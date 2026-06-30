-- name: CreateRegistration :one
INSERT INTO registrations (
    division_id, team_id, player_id, registered_by_user_id,
    status, seed, registration_notes, admin_notes, seeking_partner
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING *;

-- name: GetRegistrationByID :one
SELECT * FROM registrations WHERE id = $1;

-- name: ListRegistrationsByDivision :many
SELECT * FROM registrations
WHERE division_id = $1
ORDER BY seed ASC NULLS LAST, registered_at ASC
LIMIT $2 OFFSET $3;

-- name: CountRegistrationsByDivision :one
SELECT COUNT(*) FROM registrations WHERE division_id = $1;

-- name: CountRegistrationsByDivisionAndStatus :one
SELECT COUNT(*) FROM registrations
WHERE division_id = $1 AND status = $2;

-- name: CountActiveRegistrationsByDivision :one
SELECT COUNT(*) FROM registrations
WHERE division_id = $1 AND status IN ('approved', 'checked_in');

-- name: ListRegistrationsByDivisionAndStatus :many
SELECT * FROM registrations
WHERE division_id = $1 AND status = $2
ORDER BY seed ASC NULLS LAST, registered_at ASC
LIMIT $3 OFFSET $4;

-- name: ListRegistrationsByPlayer :many
SELECT r.* FROM registrations r
JOIN divisions d ON d.id = r.division_id
JOIN tournaments t ON t.id = d.tournament_id
WHERE r.player_id = $1
ORDER BY t.start_date DESC
LIMIT $2 OFFSET $3;

-- name: CountRegistrationsByPlayer :one
SELECT COUNT(*) FROM registrations WHERE player_id = $1;

-- name: ListRegistrationsByTeam :many
SELECT r.* FROM registrations r
JOIN divisions d ON d.id = r.division_id
JOIN tournaments t ON t.id = d.tournament_id
WHERE r.team_id = $1
ORDER BY t.start_date DESC
LIMIT $2 OFFSET $3;

-- name: CountRegistrationsByTeam :one
SELECT COUNT(*) FROM registrations WHERE team_id = $1;

-- name: UpdateRegistrationStatus :one
UPDATE registrations SET
    status = $2,
    approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END,
    withdrawn_at = CASE WHEN $2 IN ('withdrawn', 'withdrawn_mid_tournament') THEN NOW() ELSE withdrawn_at END,
    checked_in_at = CASE WHEN $2 = 'checked_in' THEN NOW() ELSE checked_in_at END
WHERE id = $1
RETURNING *;

-- name: UpdateRegistrationSeed :one
UPDATE registrations SET seed = $2
WHERE id = $1
RETURNING *;

-- name: UpdateRegistrationPlacement :one
UPDATE registrations SET final_placement = $2
WHERE id = $1
RETURNING *;

-- name: UpdateRegistrationAdminNotes :one
UPDATE registrations SET admin_notes = $2
WHERE id = $1
RETURNING *;

-- name: BulkUpdateNoShow :exec
-- Marks the given registration IDs as no-show, scoped to a division so callers
-- cannot cross-division-mutate by ID. Only registrations that haven't checked
-- in and aren't already in a terminal state are eligible.
UPDATE registrations SET status = 'no_show'
WHERE division_id = @division_id
  AND id = ANY(@registration_ids::bigint[])
  AND status NOT IN ('checked_in', 'withdrawn', 'rejected', 'withdrawn_mid_tournament');

-- name: GetNextWaitlisted :one
SELECT * FROM registrations
WHERE division_id = $1 AND status = 'waitlisted'
ORDER BY registered_at ASC
LIMIT 1;

-- name: ListSeekingPartner :many
SELECT * FROM registrations
WHERE division_id = $1 AND seeking_partner = true
  AND status IN ('pending', 'approved')
ORDER BY registered_at ASC;
