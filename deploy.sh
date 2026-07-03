#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "==> Deploying viz-hist from $ROOT"

# 1. Build frontend
echo "==> Building frontend..."
cd "$ROOT/frontend"
npm run build

# 2. Restart backend
echo "==> Restarting backend..."
cd "$ROOT/backend"
if systemctl --user is-active --quiet viz-hist-backend 2>/dev/null; then
    systemctl --user restart viz-hist-backend
    echo "    Backend service restarted."
else
    echo "    No systemd service found. Start manually:"
    echo "    cd $ROOT/backend && source .venv/bin/activate && uvicorn app.main:app --port 8001"
fi

# 3. Restart frontend (Next.js production)
echo "==> Restarting frontend..."
cd "$ROOT/frontend"
if systemctl --user is-active --quiet viz-hist-frontend 2>/dev/null; then
    systemctl --user restart viz-hist-frontend
    echo "    Frontend service restarted."
else
    echo "    No systemd service found. Start manually:"
    echo "    cd $ROOT/frontend && npm start"
fi

echo "==> Deploy complete!"
