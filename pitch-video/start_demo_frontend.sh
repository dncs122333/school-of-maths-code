#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/../frontend"
PORT=3011 REACT_APP_BACKEND_URL=http://localhost:8011 BROWSER=none exec yarn start
