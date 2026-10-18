#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/frontend"

echo "⚛️ Starting VidyaLab React Frontend on http://localhost:3000..."
exec yarn start
