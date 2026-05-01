-- api/db/queries/player_profiles.sql

-- name: GetPlayerProfileRow :one
-- Note: named with the 'Row' suffix because the legacy
-- api/db/queries/players.sql still has a GetPlayerProfile that
-- queries the users table. Phase 6 cutover removes that query and
-- this one becomes the canonical lookup.
SELECT * FROM player_profiles WHERE user_id = $1;

-- name: UpsertPlayerProfile :one
-- Insert or update the 1:1 profile row. Caller passes the full set of
-- columns; pre-fetch the existing row first if you want a partial
-- update, otherwise unset fields will be overwritten with the supplied
-- values (which may be NULL).
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
    $1,
    $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12, $13, $14, $15,
    $16, $17, $18, $19,
    $20, $21, $22,
    $23, $24, $25,
    now()
)
ON CONFLICT (user_id) DO UPDATE SET
    phone                   = EXCLUDED.phone,
    dupr_id                 = EXCLUDED.dupr_id,
    vair_id                 = EXCLUDED.vair_id,
    paddle_brand            = EXCLUDED.paddle_brand,
    paddle_model            = EXCLUDED.paddle_model,
    gender                  = EXCLUDED.gender,
    handedness              = EXCLUDED.handedness,
    date_of_birth           = EXCLUDED.date_of_birth,
    bio                     = EXCLUDED.bio,
    address_line_1          = EXCLUDED.address_line_1,
    address_line_2          = EXCLUDED.address_line_2,
    city                    = EXCLUDED.city,
    state_province          = EXCLUDED.state_province,
    country                 = EXCLUDED.country,
    postal_code             = EXCLUDED.postal_code,
    formatted_address       = EXCLUDED.formatted_address,
    latitude                = EXCLUDED.latitude,
    longitude               = EXCLUDED.longitude,
    emergency_contact_name  = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    medical_notes           = EXCLUDED.medical_notes,
    waiver_accepted_at      = EXCLUDED.waiver_accepted_at,
    avatar_url              = EXCLUDED.avatar_url,
    is_profile_hidden       = EXCLUDED.is_profile_hidden,
    updated_at              = now()
RETURNING *;

-- name: DeletePlayerProfile :exec
DELETE FROM player_profiles WHERE user_id = $1;
