#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  echo ".env is missing. Copy .env.example to .env and fill in production values first." >&2
  exit 1
fi

git pull --ff-only
docker compose up -d --build
docker compose ps

echo
echo "Deployment finished. Check logs with:"
echo "  docker compose logs --tail=100"
