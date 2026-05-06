# Makefile
.PHONY: dev dev-frontend dev-all dev-up dev-down dev-logs dev-reset up down full full-down build migrate-up migrate-down migrate-create sqlc test test-db seed logto-seed backup backup-full restore restore-db backup-list backup-before-deploy

# ---- Local development (docker-compose.dev.yml) ----
# Brings up postgres + redis + logto with host port bindings; the Go
# backend runs natively on the host for fast iteration. See
# docs/LOCAL_DEV.md for the full first-run walkthrough.

# Start the dev infra (db + redis + logto)
dev-up:
	docker compose -f docker-compose.dev.yml up -d
	@echo ""
	@echo "Dev infra ready:"
	@echo "  Postgres   localhost:5432  (user=courtcommand pass=courtcommand db=courtcommand,logto)"
	@echo "  Redis      localhost:6379"
	@echo "  Logto OIDC http://localhost:3001"
	@echo "  Logto admin http://localhost:3002"
	@echo ""
	@echo "Next: see docs/LOCAL_DEV.md for first-run setup."

# Stop dev infra (preserves volumes / data)
dev-down:
	docker compose -f docker-compose.dev.yml down

# Tail logs from the dev infra services
dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

# Wipe dev infra including all data (Postgres volume + Logto state)
dev-reset:
	docker compose -f docker-compose.dev.yml down -v
	@echo "Dev infra wiped. Run 'make dev-up' to start fresh."

# Provision Logto (idempotent): creates apps, resources, scopes, org
# template, organizations, bootstrap admin, webhook. Reads config from
# .env (LOGTO_MANAGEMENT_API_APP_ID/SECRET must be set first -- see
# docs/LOCAL_DEV.md "First-run setup").
logto-seed:
	@if [ ! -f .env ]; then echo "ERROR: .env not found. Copy from .env.example first."; exit 1; fi
	@cd api && set -a && . ../.env && set +a && go run ./cmd/logto-seed

# Provision a production Logto tenant + sync sports.logto_org_id
# in the production app DB. Run ONCE at launch (re-running is safe;
# every step is idempotent). Env source order:
#   1. .env.prod (preferred -- gitignored, holds prod values)
#   2. .env (fallback for operators with a single env file)
#
# Required vars in the env file:
#   LOGTO_ENDPOINT                       https://logto.courtcommand.app
#   LOGTO_API_RESOURCE                   https://api.courtcommand.app/api
#   LOGTO_MANAGEMENT_API_APP_ID          (from Logto admin -> Apps -> M2M)
#   LOGTO_MANAGEMENT_API_APP_SECRET      (same place)
#   LOGTO_MANAGEMENT_API_RESOURCE        https://default.logto.app/api  (Logto-internal, fixed)
#   LOGTO_SPA_REDIRECT_URI               https://courtcommand.app/auth/callback
#   LOGTO_WEBHOOK_URL                    https://api.courtcommand.app/api/v1/webhooks/logto
#   LOGTO_BOOTSTRAP_EMAIL/PASSWORD/NAME  for the first admin
#   DATABASE_URL                         points at the prod app DB (for sports.logto_org_id sync)
#   APP_ENV                              must be "production" to skip Demo Sport
#
# Output: prints LOGTO_PICKLEBALL_ORG_ID, LOGTO_WEBHOOK_SIGNING_KEY,
# VITE_LOGTO_APP_ID etc. Paste into Coolify env, restart api+web.
prod-bootstrap:
	@ENV_FILE=.env.prod; if [ ! -f $$ENV_FILE ]; then ENV_FILE=.env; fi; \
	if [ ! -f $$ENV_FILE ]; then echo "ERROR: neither .env.prod nor .env found"; exit 1; fi; \
	echo "Sourcing $$ENV_FILE"; \
	cd api && set -a && . ../$$ENV_FILE && set +a && \
	if [ "$$APP_ENV" != "production" ]; then \
	  echo "ERROR: APP_ENV is not 'production' -- refusing to run prod-bootstrap with dev settings"; \
	  exit 1; \
	fi; \
	go run ./cmd/logto-seed

# ---- Legacy single-stack (docker-compose.yaml -- prod / Coolify shape) ----

# Start Docker services (db + redis only)
up:
	docker compose up -d

# Stop Docker services
down:
	docker compose down

# Run API in development mode (db + redis in Docker, API locally)
dev: up
	cd api && go run main.go

# Run web frontend in development mode
dev-frontend:
	cd web && pnpm dev

# Run backend + frontend in parallel (db + redis in Docker)
dev-all: up
	$(MAKE) dev & $(MAKE) dev-frontend

# Start full stack in Docker (db + redis + backend)
full:
	docker compose --profile full up -d --build

# Stop full stack
full-down:
	docker compose --profile full down

# Build backend Docker image
build:
	docker compose --profile full build

# Run migrations up
migrate-up: up
	cd api && goose -dir db/migrations postgres "$(DATABASE_URL)" up

# Run migrations down one step
migrate-down:
	cd api && goose -dir db/migrations postgres "$(DATABASE_URL)" down

# Create a new migration
migrate-create:
	cd api && goose -dir db/migrations create $(name) sql

# Generate sqlc code
sqlc:
	cd api && sqlc generate

# Create test database (idempotent — safe to run repeatedly)
test-db: up
	@echo "Creating test database..."
	@docker compose exec -T db psql -U courtcommand -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'courtcommand_test'" | grep -q 1 || \
		docker compose exec -T db psql -U courtcommand -d postgres -c "CREATE DATABASE courtcommand_test OWNER courtcommand;"
	@echo "Test database ready."

# Run tests (creates test-db first, migrations run automatically via TestDB)
test: test-db
	cd api && go test ./... -v -count=1

# Seed development domain data (orgs, tournaments, leagues, venues,
# matches, etc.) against the dev stack (docker-compose.dev.yml).
# Preserves the Logto-bootstrap admin row (logto_user_id IS NOT NULL);
# only wipes domain tables and shadow users.
#
# Prereqs:
#   1. make dev-up         # postgres + redis + logto running
#   2. make migrate-up     # schema is current
#   3. make logto-seed     # Logto provisioned; bootstrap admin row exists
#   4. (sign in once via the SPA so the admin is mirrored to local users)
#
# After seeding, the bootstrap admin remains the only signin-capable
# user; all other users are shadow players (status='unclaimed') / staff
# fixtures with logto_user_id=NULL.
seed:
	@echo "Seeding development domain data..."
	docker compose -f docker-compose.dev.yml exec -T db psql -U courtcommand -d courtcommand < api/db/seed.sql
	@echo "Done. Sign in via the SPA with the Logto bootstrap admin to see the seeded fixtures."

# ---- Backup & Restore ----

# Backup database only (quick, for routine saves)
backup:
	@mkdir -p backups
	@TIMESTAMP=$$(date +%Y%m%d-%H%M%S); \
	docker compose exec -T db pg_dump -U courtcommand courtcommand > backups/db-$$TIMESTAMP.sql && \
	echo "Database backup: backups/db-$$TIMESTAMP.sql ($$(wc -c < backups/db-$$TIMESTAMP.sql | tr -d ' ') bytes)"

# Full backup: database + uploaded files (for before deploys or major changes)
backup-full:
	@mkdir -p backups
	@TIMESTAMP=$$(date +%Y%m%d-%H%M%S); \
	docker compose exec -T db pg_dump -U courtcommand courtcommand > backups/db-$$TIMESTAMP.sql && \
	echo "Database backup: backups/db-$$TIMESTAMP.sql"; \
	if [ -d api/uploads ] && [ "$$(ls -A api/uploads 2>/dev/null)" ]; then \
		tar czf backups/uploads-$$TIMESTAMP.tar.gz -C api uploads && \
		echo "Uploads backup: backups/uploads-$$TIMESTAMP.tar.gz"; \
	else \
		echo "No uploads to backup"; \
	fi; \
	echo "Full backup complete: $$TIMESTAMP"

# Pre-deploy backup (alias — always run before deploying updates)
backup-before-deploy: backup-full
	@echo "Pre-deploy backup complete. Safe to deploy."

# Restore database from a backup file (usage: make restore-db FILE=backups/db-20260417-123456.sql)
restore-db:
	@if [ -z "$(FILE)" ]; then \
		echo "Usage: make restore-db FILE=backups/db-YYYYMMDD-HHMMSS.sql"; \
		echo "Available backups:"; \
		ls -la backups/db-*.sql 2>/dev/null || echo "  No database backups found"; \
		exit 1; \
	fi
	@echo "WARNING: This will replace ALL data in the database with the backup."
	@echo "File: $(FILE)"
	@read -p "Type YES to confirm: " confirm; \
	if [ "$$confirm" = "YES" ]; then \
		docker compose exec -T db psql -U courtcommand -d courtcommand -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && \
		docker compose exec -T db psql -U courtcommand courtcommand < $(FILE) && \
		echo "Database restored from $(FILE)"; \
	else \
		echo "Restore cancelled."; \
	fi

# Restore uploads from a backup file (usage: make restore-uploads FILE=backups/uploads-20260417-123456.tar.gz)
restore-uploads:
	@if [ -z "$(FILE)" ]; then \
		echo "Usage: make restore-uploads FILE=backups/uploads-YYYYMMDD-HHMMSS.tar.gz"; \
		echo "Available backups:"; \
		ls -la backups/uploads-*.tar.gz 2>/dev/null || echo "  No upload backups found"; \
		exit 1; \
	fi
	@echo "Restoring uploads from $(FILE)..."
	@tar xzf $(FILE) -C api/ && echo "Uploads restored."

# List all available backups
backup-list:
	@echo "=== Database Backups ==="
	@ls -lh backups/db-*.sql 2>/dev/null || echo "  None"
	@echo ""
	@echo "=== Upload Backups ==="
	@ls -lh backups/uploads-*.tar.gz 2>/dev/null || echo "  None"

# Package the Court Command Ghost theme into a zip ready for upload
# at https://news.courtcommand.app/ghost (Admin -> Design -> Change theme).
# Output: ghost-theme/cc-ghost-theme.zip (gitignored).
ghost-theme:
	@cd ghost-theme && rm -f cc-ghost-theme.zip && \
		zip -r cc-ghost-theme.zip . -x '*.zip' -x '.*' && \
		echo "Created ghost-theme/cc-ghost-theme.zip ($$(du -h cc-ghost-theme.zip | cut -f1))"
	@echo "Upload via Ghost admin: Settings -> Design -> Change theme -> Upload."

# Include .env if it exists
-include .env
export
