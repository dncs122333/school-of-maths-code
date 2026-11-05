#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/frontend"

echo "⚛️ Starting School of Maths React Frontend on http://localhost:3000..."
exec yarn start
