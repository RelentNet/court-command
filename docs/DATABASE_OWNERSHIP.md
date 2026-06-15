# Database Ownership and Migration Rules

This document codifies where Court Command stores data, who owns it, and when
a database migration is required. It exists because the Logto integration
(starting in v0.2.0) splits ownership across three zones, and "do I need a
migration?" is no longer a simple yes/no.

**Audience:** anyone adding a new field, table, role, scope, or feature that
touches persisted state.

---

## TL;DR

- **Schema changes need a migration.** New tables, new columns, type/nullability
  changes, new constraints, new indexes, dropped anything — all migrations.
- **Day-to-day data does not.** Inserting a tournament, registering a user,
  updating a match score — normal API calls, no migration.
- **Identity data is owned by Logto, not the database.** Adding a Logto role,
  scope, organization, or webhook is a Logto admin UI change, not a migration.

---

## The three ownership zones

### Zone A — Database is canonical

The Postgres database in `api/db/migrations/` is the **single source of truth**
for everything in this zone. New fields here always require a goose migration.

What lives here:

- All Court Command **business entities**:
  tournaments, divisions, pods, registrations, matches, match_events,
  match_series, leagues, seasons, division_templates, league_registrations,
  season_confirmations
- **Venues, courts**, court_queue, organizations *(the Court Command "club"
  kind, not Logto orgs)*, venue_managers, tournament_courts
- **Player domain data**: phone, dupr_id, vair_id, paddle, gender, handedness,
  date_of_birth, address, emergency contact, waiver, avatar — stored in the
  `player_profiles` table (added in Phase 2)
- **Operational records**: standings, scoring_presets, source_profiles,
  overlay configs, announcements, ad_configs, uploads, activity_logs,
  site_settings
- **Mirror rows of Logto identities**:
  - `users.id` (BIGSERIAL — Court Command's surrogate key) and
    `users.logto_user_id` (the FK to Logto's user)
  - `users.email` and `users.display_name` (cached for joinable display)
  - `api_keys` rows that mirror Logto M2M apps via `logto_m2m_app_id`
- **The `sports` lookup table** (Pickleball, Demo Sport — added in Phase 2)
  and all `sport_id` foreign keys on tournaments / leagues / organizations /
  venues / divisions
- **Per-entity authorization tables** that Court Command, not Logto, models:
  `org_memberships`, `tournament_staff`, `venue_managers`,
  `league_memberships` (future)

For everything in Zone A, the rule is unchanged from before the Logto
migration: **new field → goose migration → sqlc regen → Go service/handler
update → TypeScript type update**.

### Zone B — Logto is canonical

The self-hosted Logto instance at `https://logto.courtcommand.app` is the
**single source of truth** for identity and access-control vocabulary. The
Court Command database does **not** store any of the following authoritatively
— at most it caches them via webhooks. Adding or changing anything here is a
**Logto admin UI change** (or a Management API call), **not** a database
migration.

What lives here:

- `logto_user_id` (the canonical user identity that everything in Zone A
  references)
- Email + password (Logto stores the bcrypt hash; the database caches the
  email string for display)
- Display name (Logto authoritative; cached in `users.display_name`)
- `email_verified`, suspension state, MFA enrolment
- **Logto organizations** — `Pickleball`, `Demo Sport` (one Logto org per
  Court Command sport)
- **Organization roles** — `player`, `tournament_director`, `referee`,
  `scorekeeper`, `platform_admin`
- **Organization scopes** — `manage_tournaments`, `manage_matches`,
  `manage_registrations`, `manage_users`, `read_all`
- **API scopes** registered on the `Court Command API` resource —
  `read:tournaments`, `write:matches`, `read:admin`, etc. (12 total)
- **M2M app credentials** — `client_id` and `client_secret` for partner API
  keys; the database stores only the `logto_m2m_app_id` reference, never
  the secret
- **JWKS** (public keys), refresh tokens, sessions, webhook signing keys
- **Webhook subscriptions** (which events fire to which URLs)

If you ever need a new role, scope, or organization, you go to
`https://logto-admin.courtcommand.app`, change it there, and update
`docs/LOGTO_SETUP.md` so the next operator can reproduce it. **No migration.**

### Zone C — Hybrid (the bridge)

Some Court Command business facts reference a Logto identity. The relationship
is a Court Command concept; the identity is a Logto concept.

Example: "user `v3hqe8jx4wnn` is the assigned referee for tournament `123`."

- The **relationship** lives in Zone A (`tournament_staff` table → migration
  required to add or change the schema of the relationship)
- The **identity being pointed at** lives in Zone B (a Logto user record →
  no migration)
- The **bridge** is a foreign key column: `tournament_staff.user_id BIGINT
  REFERENCES users(id)`, where `users` is the Court Command mirror table
  whose `logto_user_id` points to the Logto record

When you add a new bridge table — say, `league_memberships(user_id, league_id,
role)` — you write a migration for the table itself (Zone A), but the meaning
of "role" depends on whether you're modelling a Court Command relationship
(Zone A: it's a string column) or reusing a Logto org role (Zone B: don't
duplicate; reference by name and check via JWT claim).

---

## Quick decision tree

> Should I write a database migration for this change?

1. **Am I changing the *shape* of stored data?** (new table, new column,
   changed constraint, new index, dropped anything)
   - **No** → no migration. You're inserting/updating rows; that's
     application code.
   - **Yes** → continue.
2. **Is this Court Command business data?** (tournaments, matches, venues,
   player profile, registrations, app settings, etc.)
   - **Yes** → migration in `api/db/migrations/`.
3. **Is this an identity, role, scope, or organization concept?**
   - **Yes** → no migration. Configure in Logto admin
     (`https://logto-admin.courtcommand.app`), update `docs/LOGTO_SETUP.md`.
4. **Is it a relationship between a Logto identity and a Court Command
   entity?**
   - **Yes** → migration for the relationship table; the user FK references
     `users(id)` (the mirror), not Logto directly.

## Examples

| Change | Migration? | Why |
|---|---|---|
| Add a `tournaments.banner_url` column | ✅ | Zone A schema change |
| Add a new sport (e.g. Basketball) | ✅ + Logto | Insert a row into `sports` (Zone A — done via migration since it's a lookup seed); also create a `Basketball` org in Logto admin (Zone B) |
| Add a new player profile field (e.g. `preferred_court_surface`) | ✅ | Zone A — new column on `player_profiles` |
| Insert a new tournament via the admin UI | ❌ | Zone A row, not schema |
| Add a new Logto org role (e.g. `vendor`) | ❌ | Zone B — Logto admin UI |
| Add a new API scope (e.g. `read:billing`) | ❌ | Zone B — Logto admin UI on the API resource |
| Add a `tournament_staff` row when a TD creates a tournament | ❌ | Zone A row, not schema |
| Replace `tournament_staff.raw_password` with a Logto-managed account | ✅ | Zone A schema change (drop column) |
| Add a `league_memberships` table | ✅ | Zone A schema change |
| Suspend a user via the admin UI | ❌ | Zone B — Logto Management API call (the database mirror's `users` row is unchanged structurally) |
| Update a user's email after they change it in Logto | ❌ | Zone B — webhook updates the mirror row's `email` cache; no schema change |

## Migration mechanics (Zone A only)

For Zone A schema changes, the standard flow:

1. Write a new migration in `api/db/migrations/NNNNN_descriptive_name.sql`
   following the goose `-- +goose Up` / `-- +goose Down` convention. Use the
   next available number.
2. Update `api/db/queries/*.sql` if needed.
3. Run `make sqlc-generate` (or the equivalent in this repo) to regenerate
   `api/db/generated/`.
4. Update affected Go services and handlers.
5. Update affected TypeScript types in `web/src/lib/types.ts`.
6. Update any forms / UI that touch the field.
7. Run `go test ./...`, `pnpm tsc -b --noEmit`, `pnpm build` locally before
   committing.
8. Push. Coolify runs the migration automatically on next deploy via
   `db.RunMigrations(ctx, cfg.DatabaseURL)` in `api/main.go`.

`-- +goose Down` is mandatory and must actually reverse the change. The
schema-alignment audit (`docs/superpowers/audits/2026-04-20-db-schema-alignment.md`)
exists because of past failures here.
