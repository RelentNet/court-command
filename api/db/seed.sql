-- Court Command v2 — Development Seed Data
-- Run with: make seed (uses docker-compose.dev.yml)
-- Requires: migrations applied + Logto seeded (`make logto-seed`).
--           The bootstrap admin (admin@courtcommand.local) must exist
--           in the local users table, mirrored from Logto on first sign-in.
--
-- Phase 3.6+ Logto-aware behavior:
-- - The bootstrap admin (mirrored from Logto, logto_user_id IS NOT NULL)
--   is preserved across re-seeds. Domain data uses their users.id as
--   created_by_user_id.
-- - Other seeded "users" are SHADOW PLAYERS with status='unclaimed' and
--   logto_user_id=NULL. They have names/emails/etc. so TDs can register
--   them in tournaments. When a real Logto user later signs up with
--   the same email, Phase 4+ claim logic will merge the rows.
-- - The non-admin staff (td1@, ref1@, etc.) stay status='active' so
--   role-gated UI workflows have staff to attach to tournaments. None
--   of these accounts can sign in via Logto -- they're domain fixtures.
--
-- All seeded sport_id columns point at Pickleball (the only sport at
-- launch). Demo Sport, if present, gets no seeded fixtures.

-- Wipe all existing DOMAIN data for a clean seed (CASCADE handles FK
-- ordering). DO NOT TRUNCATE users -- the bootstrap admin (mirrored
-- from Logto) must persist. Domain data we DO wipe will cascade-delete
-- shadow users via the foreign keys (e.g. team_rosters, registrations).
-- After the cascade, only the bootstrap admin remains in users.
TRUNCATE TABLE
  activity_logs,
  ad_configs,
  announcements,
  api_keys,
  court_overlay_configs,
  source_profiles,
  standings_entries,
  match_events,
  match_series,
  matches,
  registrations,
  pods,
  divisions,
  division_templates,
  tournament_courts,
  tournament_staff,
  season_confirmations,
  seasons,
  league_registrations,
  tournaments,
  leagues,
  venue_managers,
  courts,
  venues,
  uploads,
  org_blocks,
  org_memberships,
  team_rosters,
  teams,
  organizations
CASCADE;

-- Wipe all NON-bootstrap users individually so the bootstrap admin row
-- (and its player_profiles cascade child) survives. Match by Logto
-- linkage rather than email, since the bootstrap admin email is
-- configurable but logto_user_id IS NOT NULL is the source of truth.
DELETE FROM users WHERE logto_user_id IS NULL;

-- Reset sequences for tables we just truncated. users_id_seq and
-- user_public_id_seq are NOT reset (the bootstrap admin holds id=1
-- and public_id='CC-10000' from being mirrored on first signin; the
-- shadow users that follow continue from whatever the sequences
-- have advanced to).
ALTER SEQUENCE teams_id_seq RESTART WITH 1;
ALTER SEQUENCE organizations_id_seq RESTART WITH 1;
ALTER SEQUENCE venues_id_seq RESTART WITH 1;
ALTER SEQUENCE courts_id_seq RESTART WITH 1;
ALTER SEQUENCE leagues_id_seq RESTART WITH 1;
ALTER SEQUENCE seasons_id_seq RESTART WITH 1;
ALTER SEQUENCE tournaments_id_seq RESTART WITH 1;
ALTER SEQUENCE divisions_id_seq RESTART WITH 1;
ALTER SEQUENCE pods_id_seq RESTART WITH 1;
ALTER SEQUENCE registrations_id_seq RESTART WITH 1;
ALTER SEQUENCE matches_id_seq RESTART WITH 1;
ALTER SEQUENCE match_events_id_seq RESTART WITH 1;
ALTER SEQUENCE match_series_id_seq RESTART WITH 1;
ALTER SEQUENCE announcements_id_seq RESTART WITH 1;
ALTER SEQUENCE standings_entries_id_seq RESTART WITH 1;
-- scoring_presets_id_seq NOT reset — system presets are seeded by migration 00017
ALTER SEQUENCE activity_logs_id_seq RESTART WITH 1;
ALTER SEQUENCE api_keys_id_seq RESTART WITH 1;
ALTER SEQUENCE uploads_id_seq RESTART WITH 1;
ALTER SEQUENCE ad_configs_id_seq RESTART WITH 1;
ALTER SEQUENCE court_overlay_configs_id_seq RESTART WITH 1;
ALTER SEQUENCE source_profiles_id_seq RESTART WITH 1;
ALTER SEQUENCE division_templates_id_seq RESTART WITH 1;
ALTER SEQUENCE league_registrations_id_seq RESTART WITH 1;
ALTER SEQUENCE season_confirmations_id_seq RESTART WITH 1;
ALTER SEQUENCE tournament_courts_id_seq RESTART WITH 1;
ALTER SEQUENCE tournament_staff_id_seq RESTART WITH 1;
ALTER SEQUENCE org_memberships_id_seq RESTART WITH 1;
ALTER SEQUENCE org_blocks_id_seq RESTART WITH 1;
ALTER SEQUENCE team_rosters_id_seq RESTART WITH 1;
ALTER SEQUENCE venue_managers_id_seq RESTART WITH 1;

DO $$
DECLARE
  -- Pickleball sport id (Phase 2+ -- all seeded fixtures attach here)
  pickleball_id BIGINT;

  -- Admin / staff accounts
  admin_id BIGINT;
  td1_id BIGINT;
  td2_id BIGINT;
  ref1_id BIGINT;
  ref2_id BIGINT;
  scorekeeper_id BIGINT;
  broadcast_id BIGINT;
  daniel_id BIGINT;

  -- Players (16)
  p1_id BIGINT; p2_id BIGINT; p3_id BIGINT; p4_id BIGINT;
  p5_id BIGINT; p6_id BIGINT; p7_id BIGINT; p8_id BIGINT;
  p9_id BIGINT; p10_id BIGINT; p11_id BIGINT; p12_id BIGINT;
  p13_id BIGINT; p14_id BIGINT; p15_id BIGINT; p16_id BIGINT;

  -- Organizations (3)
  org1_id BIGINT; org2_id BIGINT; org3_id BIGINT;

  -- Teams (8)
  t1_id BIGINT; t2_id BIGINT; t3_id BIGINT; t4_id BIGINT;
  t5_id BIGINT; t6_id BIGINT; t7_id BIGINT; t8_id BIGINT;

  -- Venues (2)
  v1_id BIGINT; v2_id BIGINT;

  -- Courts (8 total: 4 per venue)
  c1_id BIGINT; c2_id BIGINT; c3_id BIGINT; c4_id BIGINT;
  c5_id BIGINT; c6_id BIGINT; c7_id BIGINT; c8_id BIGINT;

  -- Leagues (2)
  lg1_id BIGINT; lg2_id BIGINT;

  -- Seasons (3: 2 for league 1, 1 for league 2)
  s1_id BIGINT; s2_id BIGINT; s3_id BIGINT;

  -- Tournaments (3)
  tn1_id BIGINT; tn2_id BIGINT; tn3_id BIGINT;

  -- Divisions (6: 2 per tournament)
  d1_id BIGINT; d2_id BIGINT; d3_id BIGINT; d4_id BIGINT; d5_id BIGINT; d6_id BIGINT;

  -- Pods (2: for round-robin divisions)
  pod1_id BIGINT; pod2_id BIGINT;

  -- Registrations
  r1_id BIGINT; r2_id BIGINT; r3_id BIGINT; r4_id BIGINT;
  r5_id BIGINT; r6_id BIGINT; r7_id BIGINT; r8_id BIGINT;

  -- Matches (6)
  m1_id BIGINT; m2_id BIGINT; m3_id BIGINT; m4_id BIGINT; m5_id BIGINT; m6_id BIGINT;

  -- Match series (2)
  ms1_id BIGINT; ms2_id BIGINT;

  -- Quick matches (2)
  qm1_id BIGINT; qm2_id BIGINT;

  -- Division templates (2)
  dt1_id BIGINT; dt2_id BIGINT;

  -- League registrations (2)
  lr1_id BIGINT; lr2_id BIGINT;

  -- Sentinel password_hash for shadow users -- they cannot sign in via
  -- Logto (logto_user_id IS NULL). Empty string matches the sentinel
  -- the Phase 3.5 webhook handler uses for newly-mirrored users; the
  -- column stays NOT NULL until Phase 6 cutover drops it.
  pw_hash TEXT := '';
BEGIN

-- ============================================================
-- 0. RESOLVE BOOTSTRAP ADMIN + PICKLEBALL SPORT ID
-- ============================================================
-- The bootstrap admin is mirrored from Logto (logto_user_id IS NOT NULL).
-- We look them up by Logto-linkage rather than email so the seed
-- survives a configurable LOGTO_BOOTSTRAP_EMAIL.
SELECT id INTO admin_id FROM users WHERE logto_user_id IS NOT NULL ORDER BY id LIMIT 1;
IF admin_id IS NULL THEN
  RAISE EXCEPTION 'No Logto-linked admin user found. Run `make logto-seed` and sign in once before seeding domain data.';
END IF;

SELECT id INTO pickleball_id FROM sports WHERE slug = 'pickleball';
IF pickleball_id IS NULL THEN
  RAISE EXCEPTION 'Sport `pickleball` not found in sports table. Migrations must run first.';
END IF;

-- ============================================================
-- 1. USERS (23 shadow users: 2 TDs, 2 refs, 1 scorekeeper, 1 broadcast op, 1 daniel, 16 players)
-- ============================================================
-- These are SHADOW PLAYERS / staff with logto_user_id=NULL. They cannot
-- sign in via Logto on their own. status='unclaimed' for players (the
-- explicit "TD-created" status); status='active' for staff so
-- role-gated workflows still work in dev.
-- The bootstrap admin (admin_id, resolved above) is reused as needed.

INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'td1@courtcommand.com', pw_hash, 'Tournament', 'Director', '1985-06-20', 'tournament_director', 'active')
RETURNING id INTO td1_id;

INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'td2@courtcommand.com', pw_hash, 'Sarah', 'DirectorTwo', '1987-09-12', 'tournament_director', 'active')
RETURNING id INTO td2_id;

INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'ref1@courtcommand.com', pw_hash, 'Head', 'Referee', '1988-03-10', 'head_referee', 'active')
RETURNING id INTO ref1_id;

INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'ref2@courtcommand.com', pw_hash, 'Line', 'Judge', '1991-11-28', 'referee', 'active')
RETURNING id INTO ref2_id;

INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'scorekeeper@courtcommand.com', pw_hash, 'Score', 'Keeper', '1999-02-14', 'scorekeeper', 'active')
RETURNING id INTO scorekeeper_id;

INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'broadcast@courtcommand.com', pw_hash, 'Broadcast', 'Operator', '1993-07-04', 'broadcast_operator', 'active')
RETURNING id INTO broadcast_id;

-- Daniel Velez — shadow admin (cannot sign in via Logto on this row;
-- the real Daniel signs in with admin@courtcommand.local during dev,
-- which mirrors to admin_id above. This row exists so domain data
-- can attribute ownership/creation to "Daniel" without conflating
-- with the dev bootstrap admin).
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'daniel.f.velez@gmail.com', pw_hash, 'Daniel', 'Velez', '1990-01-01', 'platform_admin', 'unclaimed')
RETURNING id INTO daniel_id;

-- 16 Players (variety of cities, genders, handedness)
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'alex.j@demo.com', pw_hash, 'Alex', 'Johnson', '1995-04-12', 'player', 'unclaimed', 'male', 'right', 'Dallas', 'TX', 'US') RETURNING id INTO p1_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'maria.g@demo.com', pw_hash, 'Maria', 'Garcia', '1993-08-25', 'player', 'unclaimed', 'female', 'right', 'Dallas', 'TX', 'US') RETURNING id INTO p2_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'james.w@demo.com', pw_hash, 'James', 'Wilson', '1990-11-03', 'player', 'unclaimed', 'male', 'left', 'Fort Worth', 'TX', 'US') RETURNING id INTO p3_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'sarah.c@demo.com', pw_hash, 'Sarah', 'Chen', '1997-02-18', 'player', 'unclaimed', 'female', 'right', 'Fort Worth', 'TX', 'US') RETURNING id INTO p4_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'mike.b@demo.com', pw_hash, 'Mike', 'Brown', '1992-07-30', 'player', 'unclaimed', 'male', 'right', 'Austin', 'TX', 'US') RETURNING id INTO p5_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'lisa.p@demo.com', pw_hash, 'Lisa', 'Park', '1996-12-05', 'player', 'unclaimed', 'female', 'left', 'Austin', 'TX', 'US') RETURNING id INTO p6_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'david.k@demo.com', pw_hash, 'David', 'Kim', '1994-09-14', 'player', 'unclaimed', 'male', 'right', 'Houston', 'TX', 'US') RETURNING id INTO p7_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'emma.d@demo.com', pw_hash, 'Emma', 'Davis', '1998-05-22', 'player', 'unclaimed', 'female', 'right', 'Houston', 'TX', 'US') RETURNING id INTO p8_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'carlos.r@demo.com', pw_hash, 'Carlos', 'Rodriguez', '1991-03-08', 'player', 'unclaimed', 'male', 'right', 'San Antonio', 'TX', 'US') RETURNING id INTO p9_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'jenny.l@demo.com', pw_hash, 'Jenny', 'Lee', '1996-07-19', 'player', 'unclaimed', 'female', 'right', 'San Antonio', 'TX', 'US') RETURNING id INTO p10_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'kevin.m@demo.com', pw_hash, 'Kevin', 'Martinez', '1989-12-01', 'player', 'unclaimed', 'male', 'left', 'El Paso', 'TX', 'US') RETURNING id INTO p11_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'amy.t@demo.com', pw_hash, 'Amy', 'Taylor', '1994-05-15', 'player', 'unclaimed', 'female', 'right', 'El Paso', 'TX', 'US') RETURNING id INTO p12_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'brandon.h@demo.com', pw_hash, 'Brandon', 'Harris', '1993-10-22', 'player', 'unclaimed', 'male', 'right', 'Plano', 'TX', 'US') RETURNING id INTO p13_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'rachel.w@demo.com', pw_hash, 'Rachel', 'White', '1997-08-30', 'player', 'unclaimed', 'female', 'right', 'Plano', 'TX', 'US') RETURNING id INTO p14_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'tyler.n@demo.com', pw_hash, 'Tyler', 'Nguyen', '1990-06-14', 'player', 'unclaimed', 'male', 'right', 'Arlington', 'TX', 'US') RETURNING id INTO p15_id;
INSERT INTO users (public_id, email, password_hash, first_name, last_name, date_of_birth, role, status, gender, handedness, city, state_province, country)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'olivia.s@demo.com', pw_hash, 'Olivia', 'Scott', '1998-01-25', 'player', 'unclaimed', 'female', 'left', 'Arlington', 'TX', 'US') RETURNING id INTO p16_id;

-- ============================================================
-- 2. ORGANIZATIONS (3)
-- ============================================================

INSERT INTO organizations (name, slug, city, state_province, country, bio, primary_color, created_by_user_id, formatted_address)
VALUES ('North Texas Pickleball Club', 'north-texas-pickleball-club', 'Dallas', 'TX', 'US', 'The premier pickleball organization in North Texas. Home to the Dallas Dinkers and Fort Worth Aces.', '#1e40af', admin_id, 'Dallas, TX, US')
RETURNING id INTO org1_id;

INSERT INTO organizations (name, slug, city, state_province, country, bio, primary_color, created_by_user_id, formatted_address)
VALUES ('Gulf Coast Pickleball Alliance', 'gulf-coast-pickleball-alliance', 'Houston', 'TX', 'US', 'Bringing competitive pickleball to the Gulf Coast region since 2024.', '#16a34a', admin_id, 'Houston, TX, US')
RETURNING id INTO org2_id;

INSERT INTO organizations (name, slug, city, state_province, country, bio, primary_color, secondary_color, created_by_user_id, formatted_address)
VALUES ('Central Texas Paddle Sports', 'central-texas-paddle-sports', 'Austin', 'TX', 'US', 'Austin-based paddle sports organization covering Central Texas. Teams compete across multiple leagues.', '#7c3aed', '#a78bfa', td2_id, 'Austin, TX, US')
RETURNING id INTO org3_id;

-- Org memberships
INSERT INTO org_memberships (org_id, player_id, role) VALUES
  (org1_id, admin_id, 'admin'),
  (org1_id, p1_id, 'member'), (org1_id, p2_id, 'member'),
  (org1_id, p3_id, 'member'), (org1_id, p4_id, 'member'),
  (org1_id, p13_id, 'member'), (org1_id, p14_id, 'member'),
  (org2_id, admin_id, 'admin'),
  (org2_id, p7_id, 'member'), (org2_id, p8_id, 'member'),
  (org2_id, p9_id, 'member'), (org2_id, p10_id, 'member'),
  (org3_id, td2_id, 'admin'),
  (org3_id, p5_id, 'member'), (org3_id, p6_id, 'member'),
  (org3_id, p11_id, 'member'), (org3_id, p12_id, 'member'),
  (org3_id, p15_id, 'member'), (org3_id, p16_id, 'member');

-- ============================================================
-- 3. TEAMS (8 teams: 3 org1, 2 org2, 3 org3)
-- ============================================================

INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('Dallas Dinkers', 'DAL', 'dallas-dinkers', '#1e40af', org1_id, 'Dallas') RETURNING id INTO t1_id;
INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('Fort Worth Aces', 'FTW', 'fort-worth-aces', '#dc2626', org1_id, 'Fort Worth') RETURNING id INTO t2_id;
INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('Plano Pioneers', 'PLN', 'plano-pioneers', '#0891b2', org1_id, 'Plano') RETURNING id INTO t3_id;
INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('Houston Heat', 'HOU', 'houston-heat', '#ea580c', org2_id, 'Houston') RETURNING id INTO t4_id;
INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('San Antonio Smash', 'SAT', 'san-antonio-smash', '#ca8a04', org2_id, 'San Antonio') RETURNING id INTO t5_id;
INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('Austin Smashers', 'AUS', 'austin-smashers', '#16a34a', org3_id, 'Austin') RETURNING id INTO t6_id;
INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('El Paso Thunder', 'ELP', 'el-paso-thunder', '#9333ea', org3_id, 'El Paso') RETURNING id INTO t7_id;
INSERT INTO teams (name, short_name, slug, primary_color, org_id, city) VALUES ('Arlington Arrows', 'ARL', 'arlington-arrows', '#059669', org3_id, 'Arlington') RETURNING id INTO t8_id;

-- Team rosters (2 players per team)
INSERT INTO team_rosters (team_id, player_id, role, status) VALUES
  (t1_id, p1_id, 'captain', 'active'), (t1_id, p2_id, 'player', 'active'),
  (t2_id, p3_id, 'captain', 'active'), (t2_id, p4_id, 'player', 'active'),
  (t3_id, p13_id, 'captain', 'active'), (t3_id, p14_id, 'player', 'active'),
  (t4_id, p7_id, 'captain', 'active'), (t4_id, p8_id, 'player', 'active'),
  (t5_id, p9_id, 'captain', 'active'), (t5_id, p10_id, 'player', 'active'),
  (t6_id, p5_id, 'captain', 'active'), (t6_id, p6_id, 'player', 'active'),
  (t7_id, p11_id, 'captain', 'active'), (t7_id, p12_id, 'player', 'active'),
  (t8_id, p15_id, 'captain', 'active'), (t8_id, p16_id, 'player', 'active');

-- ============================================================
-- 4. VENUES (2) + COURTS (8 total)
-- ============================================================

INSERT INTO venues (name, slug, status, address_line_1, city, state_province, country, postal_code, timezone, bio, created_by_user_id, formatted_address, latitude, longitude)
VALUES ('Pickleton Sports Complex', 'pickleton-sports-complex', 'published', '2585 Schwegmann Drive', 'Marrero', 'LA', 'US', '70072', 'America/Chicago', 'A state-of-the-art sports facility with 4 dedicated pickleball courts, pro shop, and spectator seating.', admin_id, '2585 Schwegmann Drive, Marrero, LA 70072, US', 29.8994, -90.1101)
RETURNING id INTO v1_id;

INSERT INTO venues (name, slug, status, address_line_1, city, state_province, country, postal_code, timezone, bio, created_by_user_id, formatted_address, latitude, longitude)
VALUES ('Lone Star Paddle Center', 'lone-star-paddle-center', 'published', '4200 W Pioneer Pkwy', 'Arlington', 'TX', 'US', '76013', 'America/Chicago', 'Arlington''s premier indoor pickleball facility with 4 courts, climate-controlled, LED lighting, and live streaming capabilities.', td1_id, '4200 W Pioneer Pkwy, Arlington, TX 76013, US', 32.7157, -97.1305)
RETURNING id INTO v2_id;

-- Venue managers
INSERT INTO venue_managers (venue_id, user_id, role, added_by) VALUES
  (v1_id, admin_id, 'admin', admin_id),
  (v1_id, td1_id, 'manager', admin_id),
  (v2_id, td1_id, 'admin', td1_id),
  (v2_id, td2_id, 'manager', td1_id);

-- Courts for Venue 1 (Pickleton)
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Court 1', 'court-1', v1_id, 'indoor_hard', true, true, 1, admin_id) RETURNING id INTO c1_id;
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Court 2', 'court-2', v1_id, 'indoor_hard', false, true, 2, admin_id) RETURNING id INTO c2_id;
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Court 3', 'court-3', v1_id, 'indoor_hard', false, true, 3, admin_id) RETURNING id INTO c3_id;
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Court 4', 'court-4', v1_id, 'outdoor_concrete', false, true, 4, admin_id) RETURNING id INTO c4_id;

-- Courts for Venue 2 (Lone Star)
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Center Court', 'center-court', v2_id, 'indoor_hard', true, true, 1, td1_id) RETURNING id INTO c5_id;
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Court A', 'court-a', v2_id, 'indoor_hard', false, true, 2, td1_id) RETURNING id INTO c6_id;
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Court B', 'court-b', v2_id, 'indoor_hard', false, true, 3, td1_id) RETURNING id INTO c7_id;
INSERT INTO courts (name, slug, venue_id, surface_type, is_show_court, is_active, sort_order, created_by_user_id) VALUES ('Outdoor Court', 'outdoor-court', v2_id, 'outdoor_sport_court', false, true, 4, td1_id) RETURNING id INTO c8_id;

-- ============================================================
-- 5. LEAGUES (2) + DIVISION TEMPLATES
-- ============================================================

INSERT INTO leagues (public_id, name, slug, status, city, state_province, country, description, created_by_user_id, formatted_address)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'Texas Pickleball League', 'texas-pickleball-league', 'active', 'Dallas', 'TX', 'US', 'The premier pickleball league covering all of Texas. Multiple seasons per year with divisions for all skill levels.', admin_id, 'Dallas, TX, US')
RETURNING id INTO lg1_id;

INSERT INTO leagues (public_id, name, slug, status, city, state_province, country, description, created_by_user_id, formatted_address)
VALUES ('CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'), 'Gulf South Paddle League', 'gulf-south-paddle-league', 'active', 'Houston', 'TX', 'US', 'A competitive pickleball league for the Gulf South region. Features both recreational and competitive divisions.', td2_id, 'Houston, TX, US')
RETURNING id INTO lg2_id;

-- Division templates for League 1
INSERT INTO division_templates (league_id, name, format, gender_restriction, bracket_format, seed_method, max_teams, auto_approve)
VALUES (lg1_id, 'Open Doubles', 'doubles', 'open', 'single_elimination', 'rating', 16, true)
RETURNING id INTO dt1_id;

INSERT INTO division_templates (league_id, name, format, gender_restriction, bracket_format, seed_method, max_teams, auto_approve)
VALUES (lg1_id, 'Mixed Doubles', 'mixed_doubles', 'mixed', 'round_robin', 'manual', 8, true)
RETURNING id INTO dt2_id;

-- ============================================================
-- 6. SEASONS (3: 2 for league 1, 1 for league 2)
-- ============================================================

INSERT INTO seasons (name, slug, league_id, status, start_date, end_date, standings_method)
VALUES ('Spring 2026', 'spring-2026', lg1_id, 'active', '2026-03-01', '2026-06-30', 'win_loss')
RETURNING id INTO s1_id;

INSERT INTO seasons (name, slug, league_id, status, start_date, end_date, standings_method)
VALUES ('Fall 2025', 'fall-2025', lg1_id, 'completed', '2025-09-01', '2025-12-15', 'placement_points')
RETURNING id INTO s2_id;

INSERT INTO seasons (name, slug, league_id, status, start_date, end_date, standings_method)
VALUES ('Season One', 'season-one', lg2_id, 'active', '2026-01-15', '2026-07-31', 'match_points')
RETURNING id INTO s3_id;

-- ============================================================
-- 7. LEAGUE REGISTRATIONS (orgs joining leagues)
-- ============================================================

INSERT INTO league_registrations (league_id, org_id, status)
VALUES (lg1_id, org1_id, 'active')
RETURNING id INTO lr1_id;

INSERT INTO league_registrations (league_id, org_id, status)
VALUES (lg1_id, org3_id, 'active')
RETURNING id INTO lr2_id;

INSERT INTO league_registrations (league_id, org_id, status)
VALUES (lg2_id, org2_id, 'active');

-- Season confirmations moved after divisions (need division IDs)

-- ============================================================
-- 8. TOURNAMENTS (3)
-- ============================================================

INSERT INTO tournaments (public_id, name, slug, status, start_date, end_date, venue_id, league_id, season_id, description, created_by_user_id, td_user_id)
VALUES (
  'CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'),
  'Spring Open 2026', 'spring-open-2026', 'in_progress',
  '2026-04-15', '2026-04-17', v1_id, lg1_id, s1_id,
  'The first tournament of the Texas Pickleball League Spring 2026 season. Open doubles and mixed doubles divisions.',
  admin_id, td1_id
) RETURNING id INTO tn1_id;

INSERT INTO tournaments (public_id, name, slug, status, start_date, end_date, venue_id, league_id, season_id, description, created_by_user_id, td_user_id)
VALUES (
  'CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'),
  'Summer Slam 2026', 'summer-slam-2026', 'published',
  '2026-06-10', '2026-06-12', v2_id, lg1_id, s1_id,
  'The marquee mid-season event at Lone Star Paddle Center. 8-team bracket, best-of-3 format.',
  td1_id, td1_id
) RETURNING id INTO tn2_id;

INSERT INTO tournaments (public_id, name, slug, status, start_date, end_date, venue_id, league_id, season_id, description, created_by_user_id, td_user_id)
VALUES (
  'CC-' || lpad(nextval('user_public_id_seq')::TEXT, 5, '0'),
  'Gulf South Kickoff', 'gulf-south-kickoff', 'registration_open',
  '2026-05-01', '2026-05-03', v2_id, lg2_id, s3_id,
  'The inaugural tournament of the Gulf South Paddle League. Open to all skill levels.',
  td2_id, td2_id
) RETURNING id INTO tn3_id;

-- Tournament-court assignments
INSERT INTO tournament_courts (tournament_id, court_id) VALUES
  (tn1_id, c1_id), (tn1_id, c2_id), (tn1_id, c3_id), (tn1_id, c4_id),
  (tn2_id, c5_id), (tn2_id, c6_id), (tn2_id, c7_id),
  (tn3_id, c5_id), (tn3_id, c6_id), (tn3_id, c7_id), (tn3_id, c8_id);

-- ============================================================
-- 10. DIVISIONS (6: 2 per tournament)
-- ============================================================

INSERT INTO divisions (name, slug, tournament_id, format, gender_restriction, bracket_format, scoring_format, status, max_teams, seed_method, auto_approve)
VALUES ('Open Doubles', 'open-doubles', tn1_id, 'doubles', 'open', 'single_elimination', '{"scoring_type":"side_out","points_to_win":11,"win_by":2,"games_per_set":1,"sets_to_win":2}', 'in_progress', 16, 'rating', true)
RETURNING id INTO d1_id;

INSERT INTO divisions (name, slug, tournament_id, format, gender_restriction, bracket_format, scoring_format, status, max_teams, seed_method, auto_approve)
VALUES ('Mixed Doubles', 'mixed-doubles', tn1_id, 'mixed_doubles', 'mixed', 'round_robin', '{"scoring_type":"rally","points_to_win":15,"win_by":2,"games_per_set":1,"sets_to_win":1}', 'registration_open', 8, 'manual', true)
RETURNING id INTO d2_id;

INSERT INTO divisions (name, slug, tournament_id, format, gender_restriction, bracket_format, scoring_format, status, max_teams, seed_method, auto_approve)
VALUES ('Pro Doubles', 'pro-doubles', tn2_id, 'doubles', 'open', 'double_elimination', '{"scoring_type":"side_out","points_to_win":11,"win_by":2,"games_per_set":1,"sets_to_win":2}', 'draft', 8, 'rating', true)
RETURNING id INTO d3_id;

INSERT INTO divisions (name, slug, tournament_id, format, gender_restriction, bracket_format, scoring_format, status, max_teams, seed_method, auto_approve)
VALUES ('Recreational Singles', 'rec-singles', tn2_id, 'singles', 'open', 'round_robin', '{"scoring_type":"rally","points_to_win":11,"win_by":2,"games_per_set":1,"sets_to_win":1}', 'draft', 16, 'random', true)
RETURNING id INTO d4_id;

INSERT INTO divisions (name, slug, tournament_id, format, gender_restriction, bracket_format, scoring_format, status, max_teams, seed_method, auto_approve)
VALUES ('Open Doubles', 'open-doubles', tn3_id, 'doubles', 'open', 'single_elimination', '{"scoring_type":"side_out","points_to_win":11,"win_by":2,"games_per_set":1,"sets_to_win":2}', 'registration_open', 16, 'manual', true)
RETURNING id INTO d5_id;

INSERT INTO divisions (name, slug, tournament_id, format, gender_restriction, bracket_format, scoring_format, status, max_teams, seed_method, auto_approve)
VALUES ('Womens Doubles', 'womens-doubles', tn3_id, 'doubles', 'womens', 'single_elimination', '{"scoring_type":"side_out","points_to_win":11,"win_by":2,"games_per_set":1,"sets_to_win":2}', 'registration_open', 8, 'manual', true)
RETURNING id INTO d6_id;

-- ============================================================
-- SEASON CONFIRMATIONS (moved here — needs division IDs)
-- ============================================================

INSERT INTO season_confirmations (season_id, team_id, division_id, confirmed, deadline)
VALUES (s1_id, t1_id, d1_id, true, '2026-02-28');
INSERT INTO season_confirmations (season_id, team_id, division_id, confirmed, deadline)
VALUES (s1_id, t2_id, d1_id, true, '2026-02-28');
INSERT INTO season_confirmations (season_id, team_id, division_id, confirmed, deadline)
VALUES (s1_id, t6_id, d1_id, false, '2026-02-28');

-- ============================================================
-- 11. PODS (2 for round-robin divisions)
-- ============================================================

INSERT INTO pods (name, division_id, sort_order) VALUES ('Pool A', d2_id, 1) RETURNING id INTO pod1_id;
INSERT INTO pods (name, division_id, sort_order) VALUES ('Pool B', d2_id, 2) RETURNING id INTO pod2_id;

-- ============================================================
-- 12. REGISTRATIONS (8 in tournament 1, 4 in tournament 3)
-- ============================================================

-- Open Doubles (tournament 1, division 1) — 4 teams checked in
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status, seed) VALUES (d1_id, t1_id, admin_id, 'checked_in', 1) RETURNING id INTO r1_id;
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status, seed) VALUES (d1_id, t2_id, admin_id, 'checked_in', 2) RETURNING id INTO r2_id;
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status, seed) VALUES (d1_id, t6_id, td2_id, 'checked_in', 3) RETURNING id INTO r3_id;
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status, seed) VALUES (d1_id, t4_id, admin_id, 'checked_in', 4) RETURNING id INTO r4_id;

-- Mixed Doubles (tournament 1, division 2) — 4 teams approved (round-robin, no seeds yet)
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d2_id, t1_id, admin_id, 'approved') RETURNING id INTO r5_id;
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d2_id, t4_id, admin_id, 'approved') RETURNING id INTO r6_id;
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d2_id, t6_id, td2_id, 'approved') RETURNING id INTO r7_id;
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d2_id, t7_id, td2_id, 'approved') RETURNING id INTO r8_id;

-- Gulf South Kickoff (tournament 3) — 2 teams registered
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d5_id, t4_id, admin_id, 'approved');
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d5_id, t5_id, admin_id, 'approved');
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d6_id, t4_id, admin_id, 'pending');
INSERT INTO registrations (division_id, team_id, registered_by_user_id, status) VALUES (d6_id, t5_id, admin_id, 'pending');

-- ============================================================
-- 13. MATCHES (6 bracket matches for tournament 1 Open Doubles)
-- ============================================================

-- Semi 1: Dallas Dinkers vs Houston Heat (in progress, 7-5)
INSERT INTO matches (
  public_id, division_id, court_id, round, match_number,
  status, team1_id, team2_id, team1_seed, team2_seed,
  points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number,
  current_game, referee_user_id, created_by_user_id
) VALUES (
  'sf1-' || substr(md5(random()::text), 1, 12), d1_id, c1_id, 1, 1,
  'in_progress', t1_id, t4_id, 1, 4,
  11, 2, 1, 2, false, 7, 5, 1, 1, 1, ref1_id, td1_id
) RETURNING id INTO m1_id;

-- Semi 2: Fort Worth Aces vs Austin Smashers (scheduled)
INSERT INTO matches (
  public_id, division_id, court_id, round, match_number,
  status, team1_id, team2_id, team1_seed, team2_seed,
  points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number,
  current_game, referee_user_id, created_by_user_id
) VALUES (
  'sf2-' || substr(md5(random()::text), 1, 12), d1_id, c2_id, 1, 2,
  'scheduled', t2_id, t6_id, 2, 3,
  11, 2, 1, 2, false, 0, 0, 1, 1, 1, ref2_id, td1_id
) RETURNING id INTO m2_id;

-- Final: TBD vs TBD (scheduled)
INSERT INTO matches (
  public_id, division_id, court_id, round, match_number,
  status, points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number, current_game, created_by_user_id
) VALUES (
  'final-' || substr(md5(random()::text), 1, 12), d1_id, c1_id, 2, 3,
  'scheduled', 11, 2, 1, 2, false, 0, 0, 1, 1, 1, td1_id
) RETURNING id INTO m3_id;

-- Wire bracket: semi winners feed into final
UPDATE matches SET next_match_id = m3_id WHERE id IN (m1_id, m2_id);

-- 3 round-robin matches for Mixed Doubles (pool play — pods)
INSERT INTO matches (
  public_id, division_id, pod_id, round, match_number,
  status, team1_id, team2_id,
  points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number, current_game, created_by_user_id
) VALUES (
  'rr1-' || substr(md5(random()::text), 1, 12), d2_id, pod1_id, 1, 1,
  'scheduled', t1_id, t4_id,
  15, 2, 1, 1, true, 0, 0, 1, 1, 1, td1_id
) RETURNING id INTO m4_id;

INSERT INTO matches (
  public_id, division_id, pod_id, round, match_number,
  status, team1_id, team2_id,
  points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number, current_game, created_by_user_id
) VALUES (
  'rr2-' || substr(md5(random()::text), 1, 12), d2_id, pod2_id, 1, 2,
  'scheduled', t6_id, t7_id,
  15, 2, 1, 1, true, 0, 0, 1, 1, 1, td1_id
) RETURNING id INTO m5_id;

INSERT INTO matches (
  public_id, division_id, round, match_number,
  status, team1_id, team2_id,
  points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number, current_game, created_by_user_id
) VALUES (
  'rr3-' || substr(md5(random()::text), 1, 12), d2_id, 1, 3,
  'scheduled', t1_id, t6_id,
  15, 2, 1, 1, true, 0, 0, 1, 1, 1, td1_id
) RETURNING id INTO m6_id;

-- ============================================================
-- 14. MATCH EVENTS (scoring events on Semi 1)
-- ============================================================

INSERT INTO match_events (match_id, sequence_id, event_type, payload, team1_score, team2_score, current_game, serving_team, server_number, created_by_user_id)
VALUES
(m1_id, 1, 'start_game', '{"game":1}', 0, 0, 1, 1, 1, ref1_id),
(m1_id, 2, 'point_team1', '{"team":1}', 1, 0, 1, 1, 1, ref1_id),
(m1_id, 3, 'point_team1', '{"team":1}', 2, 0, 1, 1, 1, ref1_id),
(m1_id, 4, 'side_out', '{}', 2, 0, 1, 2, 1, ref1_id),
(m1_id, 5, 'point_team2', '{"team":2}', 2, 1, 1, 2, 1, ref1_id),
(m1_id, 6, 'point_team2', '{"team":2}', 2, 2, 1, 2, 1, ref1_id),
(m1_id, 7, 'side_out', '{}', 2, 2, 1, 1, 2, ref1_id),
(m1_id, 8, 'point_team1', '{"team":1}', 3, 2, 1, 1, 2, ref1_id),
(m1_id, 9, 'point_team1', '{"team":1}', 4, 2, 1, 1, 2, ref1_id),
(m1_id, 10, 'point_team1', '{"team":1}', 5, 2, 1, 1, 2, ref1_id),
(m1_id, 11, 'side_out', '{}', 5, 2, 1, 2, 2, ref1_id),
(m1_id, 12, 'point_team2', '{"team":2}', 5, 3, 1, 2, 2, ref1_id),
(m1_id, 13, 'timeout', '{"team":1}', 5, 3, 1, 2, 2, ref1_id),
(m1_id, 14, 'point_team2', '{"team":2}', 5, 4, 1, 2, 2, ref1_id),
(m1_id, 15, 'point_team2', '{"team":2}', 5, 5, 1, 2, 2, ref1_id),
(m1_id, 16, 'side_out', '{}', 5, 5, 1, 1, 1, ref1_id),
(m1_id, 17, 'point_team1', '{"team":1}', 6, 5, 1, 1, 1, ref1_id),
(m1_id, 18, 'point_team1', '{"team":1}', 7, 5, 1, 1, 1, ref1_id);

-- ============================================================
-- 15. MATCH SERIES (2)
-- ============================================================

INSERT INTO match_series (public_id, division_id, created_by_user_id, team1_id, team2_id, series_format, games_to_win, status, round, round_name, match_number)
VALUES ('ms_' || substr(md5(random()::text), 1, 12), d1_id, td1_id, t1_id, t2_id, 'best_of_3', 2, 'pending', 1, 'Semifinal', 1)
RETURNING id INTO ms1_id;

INSERT INTO match_series (public_id, division_id, created_by_user_id, team1_id, team2_id, series_format, games_to_win, status, round, round_name, match_number)
VALUES ('ms_' || substr(md5(random()::text), 1, 12), d1_id, td1_id, t6_id, t4_id, 'best_of_3', 2, 'pending', 1, 'Semifinal', 2)
RETURNING id INTO ms2_id;

-- ============================================================
-- 16. QUICK MATCHES (2)
-- ============================================================

INSERT INTO matches (
  public_id, status, match_type, team1_id, team2_id,
  points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number, current_game,
  expires_at, created_by_user_id
) VALUES (
  'qm1-' || substr(md5(random()::text), 1, 12),
  'in_progress', 'quick', t3_id, t5_id,
  11, 2, 1, 1, false,
  3, 2, 1, 2, 1,
  NOW() + INTERVAL '24 hours', admin_id
) RETURNING id INTO qm1_id;

INSERT INTO matches (
  public_id, status, match_type, team1_id, team2_id,
  points_to_win, win_by, games_per_set, sets_to_win, rally_scoring,
  team1_score, team2_score, serving_team, server_number, current_game,
  expires_at, created_by_user_id
) VALUES (
  'qm2-' || substr(md5(random()::text), 1, 12),
  'scheduled', 'quick', t7_id, t8_id,
  15, 2, 1, 1, true,
  0, 0, 1, 1, 1,
  NOW() + INTERVAL '24 hours', td1_id
) RETURNING id INTO qm2_id;

-- ============================================================
-- 17. STANDINGS ENTRIES
-- ============================================================

INSERT INTO standings_entries (season_id, division_id, team_id, wins, losses, draws, points_for, points_against, standing_points, rank)
VALUES
(s1_id, d1_id, t1_id, 3, 1, 0, 44, 32, 9, 1),
(s1_id, d1_id, t2_id, 2, 2, 0, 38, 36, 6, 2),
(s1_id, d1_id, t6_id, 2, 2, 0, 36, 38, 6, 3),
(s1_id, d1_id, t4_id, 1, 3, 0, 30, 42, 3, 4);

-- ============================================================
-- 18. OVERLAY CONFIGS (2 courts with overlay settings)
-- ============================================================

INSERT INTO court_overlay_configs (court_id, theme_id, elements, data_overrides)
VALUES (c1_id, 'classic', '{"scoreboard":{"visible":true,"auto_animate":true},"lower_third":{"visible":true,"auto_animate":true},"sponsor_bug":{"visible":false},"tournament_bug":{"visible":true}}', '{}');

INSERT INTO court_overlay_configs (court_id, theme_id, elements, data_overrides)
VALUES (c5_id, 'modern', '{"scoreboard":{"visible":true,"auto_animate":true},"lower_third":{"visible":false},"sponsor_bug":{"visible":true},"tournament_bug":{"visible":true}}', '{}');

-- ============================================================
-- 19. SOURCE PROFILES (2)
-- ============================================================

INSERT INTO source_profiles (name, source_type, created_by_user_id, api_url, auth_type, poll_interval_seconds, field_mapping, is_active)
VALUES ('Local Court Command', 'court_command', admin_id, 'http://localhost:8080', 'none', 10, '{}', true);

INSERT INTO source_profiles (name, source_type, created_by_user_id, api_url, auth_type, auth_config, poll_interval_seconds, field_mapping, is_active)
VALUES ('External Scoring System', 'rest_api', broadcast_id, 'https://api.example.com/matches', 'api_key', '{"key":"demo-api-key-12345"}', 30, '{"match_status":"status","team_1_name":"home.name","team_2_name":"away.name","team_1_score":"home.score","team_2_score":"away.score"}', true);

-- ============================================================
-- 20. API KEYS (2)
-- ============================================================

INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes, expires_at)
VALUES (admin_id, 'Admin Read-Only Key', encode(sha256('ccapi_demo_admin_key_001'::bytea), 'hex'), 'ccapi_demo_ad', ARRAY['read'], NOW() + INTERVAL '365 days');

INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes, expires_at)
VALUES (admin_id, 'Broadcast API Key', encode(sha256('ccapi_demo_broadcast_key'::bytea), 'hex'), 'ccapi_demo_br', ARRAY['read'], NOW() + INTERVAL '90 days');

-- ============================================================
-- 21. ACTIVITY LOGS (sample entries)
-- ============================================================

INSERT INTO activity_logs (user_id, action, entity_type, entity_id, metadata)
VALUES
(admin_id, 'user.create', 'user', td1_id, '{"role":"tournament_director"}'),
(admin_id, 'venue.create', 'venue', v1_id, '{"name":"Pickleton Sports Complex"}'),
(td1_id, 'tournament.create', 'tournament', tn1_id, '{"name":"Spring Open 2026"}'),
(td1_id, 'match.start', 'match', m1_id, '{"teams":"Dallas Dinkers vs Houston Heat"}'),
(admin_id, 'league.create', 'league', lg1_id, '{"name":"Texas Pickleball League"}'),
(td2_id, 'tournament.create', 'tournament', tn3_id, '{"name":"Gulf South Kickoff"}'),
(admin_id, 'venue.approve', 'venue', v2_id, '{"status":"published"}'),
(ref1_id, 'match.score', 'match', m1_id, '{"event":"point_team1","score":"7-5"}');

-- ============================================================
-- 22. ANNOUNCEMENTS (5: 3 tournament, 2 league)
-- ============================================================

INSERT INTO announcements (tournament_id, title, body, is_pinned, created_by_user_id) VALUES
(tn1_id, 'Welcome to Spring Open 2026!', '<p>Welcome all teams! Check-in is at 8am on Court 1. Please have your team roster ready.</p>', true, td1_id),
(tn1_id, 'Schedule Update', '<p>Open Doubles bracket play begins at 10am. Mixed Doubles round-robin starts at 2pm.</p>', false, td1_id),
(tn3_id, 'Registration Now Open!', '<p>The Gulf South Kickoff is accepting registrations. Open Doubles and Womens Doubles divisions available.</p>', true, td2_id);

INSERT INTO announcements (league_id, title, body, is_pinned, created_by_user_id) VALUES
(lg1_id, 'Spring 2026 Season Kicks Off!', '<p>The Spring 2026 season is officially underway. Good luck to all teams!</p>', true, admin_id),
(lg2_id, 'Welcome to Gulf South Paddle League', '<p>We are excited to announce the launch of the Gulf South Paddle League. Our first tournament is coming in May!</p>', true, td2_id);

-- ============================================================
-- DONE
-- ============================================================

RAISE NOTICE 'Seed data inserted successfully!';
RAISE NOTICE '';
RAISE NOTICE 'Sign-in: bootstrap admin (Logto-mirrored, id=%) is the only user who can sign in', admin_id;
RAISE NOTICE '';
RAISE NOTICE 'Shadow users (logto_user_id IS NULL, cannot sign in directly):';
RAISE NOTICE '  td1@courtcommand.com / td2@courtcommand.com (tournament_director, status=active)';
RAISE NOTICE '  ref1@courtcommand.com / ref2@courtcommand.com (head_referee / referee, status=active)';
RAISE NOTICE '  scorekeeper@courtcommand.com (status=active)';
RAISE NOTICE '  broadcast@courtcommand.com (broadcast_operator, status=active)';
RAISE NOTICE '  daniel.f.velez@gmail.com (platform_admin, status=unclaimed)';
RAISE NOTICE '  alex.j@demo.com through olivia.s@demo.com (16 players, status=unclaimed)';
RAISE NOTICE 'When a real Logto user signs up with a matching email, Phase 4+ claim';
RAISE NOTICE 'logic will merge the rows -- not implemented yet.';
RAISE NOTICE '';
-- ==========================================
-- 17. AD CONFIGS (RelentNet default ads)
-- ==========================================
INSERT INTO ad_configs (slot_name, ad_type, image_url, link_url, alt_text, is_active, sort_order, sizes, name, created_by_user_id)
VALUES
  ('all', 'image', '/ads/relentnet-banner.svg', 'https://relentnet.com', 'RelentNet - Empower Your Digital Presence', true, 1, ARRAY['leaderboard','responsive-banner'], 'RelentNet - Leaderboard', admin_id),
  ('all', 'image', '/ads/relentnet-mobile.svg', 'https://relentnet.com', 'RelentNet - Empower Your Digital Presence', true, 1, ARRAY['mobile-banner'], 'RelentNet - Mobile', admin_id),
  ('all', 'image', '/ads/relentnet-rectangle.svg', 'https://relentnet.com', 'RelentNet - Empower Your Digital Presence', true, 1, ARRAY['medium-rectangle'], 'RelentNet - Rectangle', admin_id);

RAISE NOTICE '  3 ad configs (RelentNet)';

-- ==========================================
-- 18. SPORT_ID BACKFILL (Phase 2+)
-- ==========================================
-- Phase 2 added sport_id to organizations/leagues/tournaments/venues/
-- divisions, all nullable. The migration backfilled existing rows but
-- the seed inserts above don't supply sport_id, so they default to NULL.
-- Backend list queries filter by X-Sport, so NULL means invisible. Here
-- we attach every seeded row to Pickleball so it shows up under
-- /pickleball/* in the SPA. (Phase 6 cutover will flip these columns
-- to NOT NULL and the seed inserts will be amended to set sport_id
-- inline.)
UPDATE organizations SET sport_id = pickleball_id WHERE sport_id IS NULL;
UPDATE leagues       SET sport_id = pickleball_id WHERE sport_id IS NULL;
UPDATE tournaments   SET sport_id = pickleball_id WHERE sport_id IS NULL;
UPDATE venues        SET sport_id = pickleball_id WHERE sport_id IS NULL;
UPDATE divisions     SET sport_id = pickleball_id WHERE sport_id IS NULL;

RAISE NOTICE '  Backfilled sport_id=pickleball on all seeded fixtures';

RAISE NOTICE 'Entities created:';
RAISE NOTICE '  1 bootstrap admin (preserved) + 23 shadow users (16 unclaimed players + 7 staff)';
RAISE NOTICE '  3 orgs, 8 teams, 2 venues, 8 courts';
RAISE NOTICE '  2 leagues, 3 seasons, 2 division templates';
RAISE NOTICE '  3 tournaments, 6 divisions, 2 pods';
RAISE NOTICE '  12 registrations, 6 bracket matches + 2 quick matches';
RAISE NOTICE '  18 match events, 2 match series, 4 standings entries';
RAISE NOTICE '  2 overlay configs, 2 source profiles, 2 API keys';
RAISE NOTICE '  8 activity logs, 5 announcements';
RAISE NOTICE '  3 league registrations, 3 season confirmations, 3 ads';

END $$;
