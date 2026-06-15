#!/bin/sh
# scripts/postgres-init/10-create-additional-databases.sh
#
# NOTE: postgres:17-alpine has no bash, so this MUST stay POSIX sh.
# The body below is sh-compatible (no arrays, [[ ]], or other bashisms).
#
# Creates additional Postgres databases listed in the
# POSTGRES_MULTIPLE_DATABASES env var (comma- or space-separated).
# Runs only on the FIRST container init -- after the volume is created.
# Subsequent container starts do not re-run init scripts; if you need to
# re-seed databases, drop the volume:
#
#   docker compose -f docker-compose.dev.yml down -v
#
# Pattern adapted from the well-known Postgres community image hack.

set -e
set -u

if [ -z "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
  echo "POSTGRES_MULTIPLE_DATABASES not set; skipping additional database creation."
  exit 0
fi

echo "Creating additional databases: ${POSTGRES_MULTIPLE_DATABASES}"
for db in $(echo "${POSTGRES_MULTIPLE_DATABASES}" | tr ',' ' '); do
  echo "  - ${db}"
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" <<-EOSQL
    SELECT 'CREATE DATABASE "${db}" OWNER "${POSTGRES_USER}"'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')
    \gexec
EOSQL
done

echo "Additional databases ready."
