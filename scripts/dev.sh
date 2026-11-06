#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DIGILOG_PYTHON="${DIGILOG_PYTHON:-.venv/bin/python}"
if [ ! -x "$DIGILOG_PYTHON" ]; then echo "Run ./scripts/setup.sh first."; exit 1; fi
export PYTHONPATH="$PWD/backend"
"$DIGILOG_PYTHON" -m uvicorn digilog.main:app --host 127.0.0.1 --port 8000 &
DIGILOG_API_PID=$!
trap 'kill "$DIGILOG_API_PID" "${DIGILOG_UI_PID:-}" 2>/dev/null || true' EXIT INT TERM
npm --prefix frontend run dev &
DIGILOG_UI_PID=$!
echo "DigiLog: http://127.0.0.1:5173 | API docs: http://127.0.0.1:8000/docs"
wait "$DIGILOG_API_PID" "$DIGILOG_UI_PID"
