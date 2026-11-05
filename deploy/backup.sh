#!/usr/bin/env bash
# Run from cron: uploads the nightly database backup to R2. See deploy/server-setup.sh.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
docker compose --env-file /opt/som/.env.compose -f docker-compose.prod.yml exec -T backend python scripts/backup_db.py

# Optional: a monitor that alerts when this line stops being reached (for example healthchecks.io)
if [ -f /opt/som/backup_ping_url ]; then
  curl -fsS -m 10 "$(cat /opt/som/backup_ping_url)" >/dev/null || true
fi
