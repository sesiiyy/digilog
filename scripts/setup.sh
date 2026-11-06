#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v npm >/dev/null || { echo "Install Node.js 22+ (includes npm), then rerun this script."; exit 1; }
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix frontend ci --ignore-scripts
echo "Setup complete. Run ./scripts/dev.sh"
