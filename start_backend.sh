#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/backend"

if [ ! -d ".venv" ]; then
    echo "❌ Error: Virtual environment 'backend/.venv' not found!"
    exit 1
fi

echo "🚀 Starting VidyaLab FastAPI Backend on http://localhost:8001 (Atlas Cloud DB)..."
exec .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload
