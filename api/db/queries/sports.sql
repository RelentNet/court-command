-- api/db/queries/sports.sql

-- name: ListSports :many
SELECT * FROM sports
WHERE is_active = true
ORDER BY sort_order, name;

-- name: GetSportByID :one
SELECT * FROM sports WHERE id = $1;

-- name: GetSportBySlug :one
SELECT * FROM sports WHERE slug = $1;

-- name: GetSportByLogtoOrgID :one
SELECT * FROM sports WHERE logto_org_id = $1;
