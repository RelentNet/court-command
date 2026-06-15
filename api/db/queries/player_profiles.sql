-- api/db/queries/player_profiles.sql

-- name: GetPlayerProfileRow :one
-- Note: named with the 'Row' suffix because the legacy
-- api/db/queries/players.sql still has a GetPlayerProfile that
-- queries the users table. Phase 6 cutover removes that query and
-- this one becomes the canonical lookup.
SELECT * FROM player_profiles WHERE user_id = $1;

-- name: UpsertPlayerProfile :one
-- Insert or partial-update the 1:1 profile row. Every field is optional
-- (sqlc.narg). On INSERT, NULL nargs become NULL in the new row. On
-- UPDATE, NULL nargs leave the existing column value unchanged via
-- COALESCE. is_profile_hidden defaults to false on insert.
--
-- This shape mirrors the existing players.sql:UpdatePlayerProfile narg
-- pattern, so a Phase 3 profile-edit form that sends only the fields
-- the user actually changed will not blow away the rest. To explicitly
-- clear a field, pass an empty-string-coerced override at the call
-- site or add a dedicated ClearPlayerProfileField query.
INSERT INTO player_profiles (
    user_id,
    phone, dupr_id, vair_id, paddle_brand, paddle_model,
    gender, handedness, date_of_birth, bio,
    address_line_1, address_line_2, city, state_province, country,
    postal_code, formatted_address, latitude, longitude,
    emergency_contact_name, emergency_contact_phone, medical_notes,
    waiver_accepted_at, avatar_url, is_profile_hidden,
    updated_at
) VALUES (
    @user_id::BIGINT,
    sqlc.narg('phone'), sqlc.narg('dupr_id'), sqlc.narg('vair_id'),
    sqlc.narg('paddle_brand'), sqlc.narg('paddle_model'),
    sqlc.narg('gender'), sqlc.narg('handedness'),
    sqlc.narg('date_of_birth'), sqlc.narg('bio'),
    sqlc.narg('address_line_1'), sqlc.narg('address_line_2'),
    sqlc.narg('city'), sqlc.narg('state_province'), sqlc.narg('country'),
    sqlc.narg('postal_code'), sqlc.narg('formatted_address'),
    sqlc.narg('latitude'), sqlc.narg('longitude'),
    sqlc.narg('emergency_contact_name'), sqlc.narg('emergency_contact_phone'),
    sqlc.narg('medical_notes'),
    sqlc.narg('waiver_accepted_at'), sqlc.narg('avatar_url'),
    COALESCE(sqlc.narg('is_profile_hidden')::BOOLEAN, false),
    now()
)
ON CONFLICT (user_id) DO UPDATE SET
    phone                   = COALESCE(sqlc.narg('phone'),                   player_profiles.phone),
    dupr_id                 = COALESCE(sqlc.narg('dupr_id'),                 player_profiles.dupr_id),
    vair_id                 = COALESCE(sqlc.narg('vair_id'),                 player_profiles.vair_id),
    paddle_brand            = COALESCE(sqlc.narg('paddle_brand'),            player_profiles.paddle_brand),
    paddle_model            = COALESCE(sqlc.narg('paddle_model'),            player_profiles.paddle_model),
    gender                  = COALESCE(sqlc.narg('gender'),                  player_profiles.gender),
    handedness              = COALESCE(sqlc.narg('handedness'),              player_profiles.handedness),
    date_of_birth           = COALESCE(sqlc.narg('date_of_birth'),           player_profiles.date_of_birth),
    bio                     = COALESCE(sqlc.narg('bio'),                     player_profiles.bio),
    address_line_1          = COALESCE(sqlc.narg('address_line_1'),          player_profiles.address_line_1),
    address_line_2          = COALESCE(sqlc.narg('address_line_2'),          player_profiles.address_line_2),
    city                    = COALESCE(sqlc.narg('city'),                    player_profiles.city),
    state_province          = COALESCE(sqlc.narg('state_province'),          player_profiles.state_province),
    country                 = COALESCE(sqlc.narg('country'),                 player_profiles.country),
    postal_code             = COALESCE(sqlc.narg('postal_code'),             player_profiles.postal_code),
    formatted_address       = COALESCE(sqlc.narg('formatted_address'),       player_profiles.formatted_address),
    latitude                = COALESCE(sqlc.narg('latitude'),                player_profiles.latitude),
    longitude               = COALESCE(sqlc.narg('longitude'),               player_profiles.longitude),
    emergency_contact_name  = COALESCE(sqlc.narg('emergency_contact_name'),  player_profiles.emergency_contact_name),
    emergency_contact_phone = COALESCE(sqlc.narg('emergency_contact_phone'), player_profiles.emergency_contact_phone),
    medical_notes           = COALESCE(sqlc.narg('medical_notes'),           player_profiles.medical_notes),
    waiver_accepted_at      = COALESCE(sqlc.narg('waiver_accepted_at'),      player_profiles.waiver_accepted_at),
    avatar_url              = COALESCE(sqlc.narg('avatar_url'),              player_profiles.avatar_url),
    is_profile_hidden       = COALESCE(sqlc.narg('is_profile_hidden'),       player_profiles.is_profile_hidden),
    updated_at              = now()
RETURNING *;

-- name: DeletePlayerProfile :exec
DELETE FROM player_profiles WHERE user_id = $1;
