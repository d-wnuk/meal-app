#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  echo ".env is missing. Copy .env.example to .env and fill in production values first." >&2
  exit 1
fi

set -a
source .env
set +a

mkdir -p backups

timestamp="$(date +"%Y%m%d-%H%M%S")"
backup_file="backups/postgres-${POSTGRES_DB}-${timestamp}.sql.gz"

docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$backup_file"

echo "Backup created at $backup_file"
