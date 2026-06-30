-- +goose Up
-- B6: Soft-delete vs. unique-constraint mismatch.
--
-- Several tables enforce slug/email/name uniqueness with plain table-level
-- UNIQUE constraints that cover ALL rows, including soft-deleted ones
-- (deleted_at IS NOT NULL). The application's pre-insert existence checks
-- (CheckTeamSlugExists, SlugExistsDivision, SlugExistsSeason,
-- SlugExistsTournament, SlugExistsLeague, CheckVenueSlugExists,
-- GetUserByEmail, etc.) all filter `deleted_at IS NULL`, so once a row is
-- soft-deleted the app considers its slug/email/name free, but the still-live
-- UNIQUE constraint rejects the re-insert with a 23505 unique_violation.
--
-- This migration realigns the DB constraints with the app's view by replacing
-- each blanket UNIQUE with a PARTIAL UNIQUE INDEX scoped to live rows
-- (WHERE deleted_at IS NULL), matching the pattern already used by courts
-- (00006). The auto-generated constraint names below follow Postgres'
-- default `<table>_<cols>_key` convention; IF EXISTS makes each drop safe.

-- teams.slug (00003): TEXT NOT NULL UNIQUE -> partial unique index.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_slug_key;
CREATE UNIQUE INDEX teams_slug_uniq ON teams(slug) WHERE deleted_at IS NULL;

-- venues.slug (00005): TEXT NOT NULL UNIQUE -> partial unique index.
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_slug_key;
CREATE UNIQUE INDEX venues_slug_uniq ON venues(slug) WHERE deleted_at IS NULL;

-- leagues.slug (00007): TEXT NOT NULL UNIQUE -> partial unique index.
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_slug_key;
CREATE UNIQUE INDEX leagues_slug_uniq ON leagues(slug) WHERE deleted_at IS NULL;

-- seasons (00008): UNIQUE (league_id, slug) -> partial unique index.
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_league_id_slug_key;
CREATE UNIQUE INDEX seasons_league_slug_uniq ON seasons(league_id, slug) WHERE deleted_at IS NULL;

-- tournaments.slug (00010): TEXT NOT NULL UNIQUE -> partial unique index.
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_slug_key;
CREATE UNIQUE INDEX tournaments_slug_uniq ON tournaments(slug) WHERE deleted_at IS NULL;

-- divisions (00011): UNIQUE (tournament_id, slug) -> partial unique index.
ALTER TABLE divisions DROP CONSTRAINT IF EXISTS divisions_tournament_id_slug_key;
CREATE UNIQUE INDEX divisions_tournament_slug_uniq ON divisions(tournament_id, slug) WHERE deleted_at IS NULL;

-- pods (00012): UNIQUE (division_id, name) -> partial unique index.
ALTER TABLE pods DROP CONSTRAINT IF EXISTS pods_division_id_name_key;
CREATE UNIQUE INDEX pods_division_name_uniq ON pods(division_id, name) WHERE deleted_at IS NULL;

-- users.email (00001): TEXT UNIQUE (email is nullable) -> partial unique
-- index scoped to live, non-null emails, matching GetUserByEmail's filter.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX users_email_uniq ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;

-- +goose Down
-- Reverse the changes: drop the partial unique indexes and restore the
-- original blanket UNIQUE constraints.

DROP INDEX IF EXISTS users_email_uniq;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);

DROP INDEX IF EXISTS pods_division_name_uniq;
ALTER TABLE pods ADD CONSTRAINT pods_division_id_name_key UNIQUE (division_id, name);

DROP INDEX IF EXISTS divisions_tournament_slug_uniq;
ALTER TABLE divisions ADD CONSTRAINT divisions_tournament_id_slug_key UNIQUE (tournament_id, slug);

DROP INDEX IF EXISTS tournaments_slug_uniq;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS seasons_league_slug_uniq;
ALTER TABLE seasons ADD CONSTRAINT seasons_league_id_slug_key UNIQUE (league_id, slug);

DROP INDEX IF EXISTS leagues_slug_uniq;
ALTER TABLE leagues ADD CONSTRAINT leagues_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS venues_slug_uniq;
ALTER TABLE venues ADD CONSTRAINT venues_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS teams_slug_uniq;
ALTER TABLE teams ADD CONSTRAINT teams_slug_key UNIQUE (slug);
