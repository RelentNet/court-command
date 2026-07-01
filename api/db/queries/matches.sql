-- name: GetMatch :one
SELECT * FROM matches WHERE id = $1;

-- name: GetMatchByPublicID :one
SELECT * FROM matches WHERE public_id = $1;

-- name: CreateMatch :one
INSERT INTO matches (
    tournament_id, division_id, pod_id, court_id, created_by_user_id,
    match_type, round, round_name, match_number,
    team1_id, team2_id, team1_seed, team2_seed,
    scoring_preset_id, games_per_set, sets_to_win, points_to_win, win_by, max_points,
    rally_scoring, timeouts_per_game, timeout_duration_sec, freeze_at,
    status, scheduled_at, expires_at,
    next_match_id, next_match_slot, loser_next_match_id, loser_next_match_slot,
    referee_user_id, notes
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10, $11, $12, $13,
    $14, $15, $16, $17, $18, $19,
    $20, $21, $22, $23,
    $24, $25, $26,
    $27, $28, $29, $30,
    $31, $32
)
RETURNING *;

-- name: UpdateMatchStatus :one
UPDATE matches SET
    status = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchScoring :one
UPDATE matches SET
    team1_score = $2,
    team2_score = $3,
    current_set = $4,
    current_game = $5,
    serving_team = $6,
    server_number = $7,
    set_scores = $8,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchResult :one
UPDATE matches SET
    status = 'completed',
    winner_team_id = $2,
    loser_team_id = $3,
    win_reason = $4,
    completed_at = now(),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchTeams :one
UPDATE matches SET
    team1_id = $2,
    team2_id = $3,
    team1_seed = $4,
    team2_seed = $5,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchCourt :one
UPDATE matches SET
    court_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchBracketWiring :one
UPDATE matches SET
    next_match_id = $2,
    next_match_slot = $3,
    loser_next_match_id = $4,
    loser_next_match_slot = $5,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchNotes :one
UPDATE matches SET
    notes = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchScoringConfig :one
UPDATE matches SET
    games_per_set = $2,
    sets_to_win = $3,
    points_to_win = $4,
    win_by = $5,
    max_points = $6,
    rally_scoring = $7,
    timeouts_per_game = $8,
    timeout_duration_sec = $9,
    freeze_at = $10,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchReferee :one
UPDATE matches SET
    referee_user_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchStarted :one
UPDATE matches SET
    status = 'in_progress',
    started_at = now(),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ListMatchesByDivision :many
SELECT * FROM matches
WHERE division_id = $1
ORDER BY round, match_number
LIMIT $2 OFFSET $3;

-- name: ListMatchesByPod :many
SELECT * FROM matches
WHERE pod_id = $1
ORDER BY round, match_number
LIMIT $2 OFFSET $3;

-- name: ListMatchesByCourt :many
SELECT * FROM matches
WHERE court_id = $1
ORDER BY court_queue_position NULLS LAST, scheduled_at NULLS LAST, created_at
LIMIT $2 OFFSET $3;

-- name: ListMatchesByCourtActive :many
SELECT * FROM matches
WHERE court_id = $1
  AND status IN ('warmup', 'in_progress', 'paused')
ORDER BY created_at;

-- name: GetActiveMatchOnCourt :one
SELECT * FROM matches
WHERE court_id = $1
  AND status IN ('warmup', 'in_progress', 'paused')
ORDER BY created_at
LIMIT 1;

-- name: ListMatchesByTeam :many
SELECT * FROM matches
WHERE team1_id = $1 OR team2_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountMatchesByTeam :one
SELECT count(*) FROM matches
WHERE team1_id = $1 OR team2_id = $1;

-- name: ListMatchesByTournament :many
SELECT * FROM matches
WHERE tournament_id = $1
ORDER BY round, match_number
LIMIT $2 OFFSET $3;

-- name: ListQuickMatches :many
SELECT * FROM matches
WHERE match_type = 'quick'
  AND created_by_user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: DeleteExpiredQuickMatches :exec
DELETE FROM matches
WHERE match_type = 'quick'
  AND expires_at IS NOT NULL
  AND expires_at < now()
  AND status = 'scheduled';

-- name: GetMatchForUpdate :one
SELECT * FROM matches WHERE id = $1 FOR UPDATE;

-- name: GetMatchByPublicIDForUpdate :one
SELECT * FROM matches WHERE public_id = $1 FOR UPDATE;

-- name: CountMatchesByDivision :one
SELECT count(*) FROM matches WHERE division_id = $1;

-- name: CountMatchesByDivisionAndStatus :one
SELECT count(*) FROM matches
WHERE division_id = $1 AND status = $2;

-- name: ListMatchesByNextMatch :many
SELECT * FROM matches
WHERE next_match_id = $1
ORDER BY next_match_slot;

-- name: ListMatchesByLoserNextMatch :many
SELECT * FROM matches
WHERE loser_next_match_id = $1
ORDER BY loser_next_match_slot;

-- name: CreateQuickMatch :one
INSERT INTO matches (
    created_by_user_id, match_type, status,
    games_per_set, sets_to_win, points_to_win, win_by,
    max_points, rally_scoring, timeouts_per_game, timeout_duration_sec, freeze_at,
    expires_at
) VALUES (
    $1, 'quick', 'scheduled',
    $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    $11
)
RETURNING *;

-- name: ListExpiredQuickMatches :many
SELECT * FROM matches
WHERE match_type = 'quick'
  AND expires_at IS NOT NULL
  AND expires_at < now()
  AND status = 'scheduled';

-- name: DeleteQuickMatchByID :exec
DELETE FROM matches
WHERE id = $1
  AND match_type = 'quick';

-- name: ListActiveQuickMatches :many
SELECT * FROM matches
WHERE match_type = 'quick'
  AND status IN ('scheduled', 'warmup', 'in_progress', 'paused')
  AND created_by_user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListQuickMatchesByUser :many
SELECT * FROM matches
WHERE match_type = 'quick'
  AND created_by_user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: CreateSeriesChildMatch :one
INSERT INTO matches (
    match_series_id, division_id, pod_id, created_by_user_id,
    match_type, match_number, status,
    team1_id, team2_id,
    games_per_set, sets_to_win, points_to_win, win_by,
    max_points, rally_scoring, timeouts_per_game, timeout_duration_sec, freeze_at
) VALUES (
    $1, $2, $3, $4,
    'tournament', $5, 'scheduled',
    $6, $7,
    $8, $9, $10, $11,
    $12, $13, $14, $15, $16
)
RETURNING *;

-- name: UpdateMatchSeriesID :one
UPDATE matches SET
    match_series_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: UpdateMatchQueuePosition :exec
UPDATE matches SET
    court_queue_position = $2,
    updated_at = now()
WHERE id = $1;

-- name: ClearCourtQueuePositions :exec
UPDATE matches SET
    court_queue_position = NULL,
    updated_at = now()
WHERE court_id = $1
    AND court_queue_position IS NOT NULL
    AND status NOT IN ('completed', 'cancelled', 'forfeited');

-- name: ListMatchesByTeamInDivision :many
SELECT * FROM matches
WHERE division_id = sqlc.arg('division_id')
  AND (team1_id = sqlc.arg('team_id') OR team2_id = sqlc.arg('team_id'))
ORDER BY created_at;

-- name: CountMatches :one
SELECT count(*) FROM matches;

-- name: CountMatchesByStatus :one
SELECT count(*) FROM matches WHERE status = $1;

-- name: ListLiveMatches :many
SELECT * FROM matches
WHERE status IN ('warmup', 'in_progress', 'paused')
ORDER BY started_at DESC NULLS LAST, created_at DESC
LIMIT $1 OFFSET $2;

-- name: CountLiveMatches :one
SELECT count(*) FROM matches
WHERE status IN ('warmup', 'in_progress', 'paused');
