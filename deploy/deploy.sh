#!/usr/bin/env bash
# Build and start the latest code, check it's healthy, and go back to the previous version if it isn't.
# Refuses to restart while a class test is running. Use --force to restart anyway.
#
#   /opt/som/app/deploy/deploy.sh [--force]
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR=/opt/som
FORCE="${1:-}"

cd "$APP_DIR"
compose() { docker compose --env-file "$STATE_DIR/.env.compose" -f docker-compose.prod.yml "$@"; }

if [ "$FORCE" != "--force" ] && [ -n "$(compose ps -q backend 2>/dev/null)" ]; then
  if ! open_attempts="$(compose exec -T backend python scripts/open_attempts.py)"; then
    echo "Could not check for running class tests. Stopped; use --force to deploy anyway." >&2
    exit 1
  fi
  if [ "$open_attempts" != "0" ]; then
    echo "$open_attempts class-test attempt(s) still have time left. Try again later, or use --force." >&2
    exit 1
  fi
fi

git pull --ff-only
new_tag="$(git rev-parse --short HEAD)"
previous_tag="$(cat "$STATE_DIR/current_tag" 2>/dev/null || true)"

echo "Building $new_tag"
TAG="$new_tag" compose build backend
TAG="$new_tag" compose up -d

healthy() {
  # Runs inside the container, so a Cloudflare or DNS problem can't look like a bad deploy
  for _ in $(seq 1 30); do
    if compose exec -T backend python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8001/api/health', timeout=4)" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

if healthy; then
  echo "$new_tag" > "$STATE_DIR/current_tag"
  docker image prune -f >/dev/null
  echo "Deployed $new_tag"
  exit 0
fi

echo "$new_tag did not become healthy." >&2
compose logs --tail=50 backend >&2 || true
if [ -n "$previous_tag" ]; then
  echo "Rolling back to $previous_tag" >&2
  TAG="$previous_tag" compose up -d
fi
exit 1
