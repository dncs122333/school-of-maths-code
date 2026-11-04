#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DIR/demo_env.sh"
cd "$DIR/../backend"
exec .venv/bin/python "$DIR/demo_server.py" --port 8011
