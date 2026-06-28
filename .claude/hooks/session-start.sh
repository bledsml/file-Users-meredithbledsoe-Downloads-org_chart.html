#!/bin/bash
# SessionStart hook: install grooming-watcher dependencies so the watcher and
# its scripts can run in Claude Code on the web sessions.
set -euo pipefail

# Only run in remote (Claude Code on the web) sessions. Locally, developers
# manage their own environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Resolve the repo root even when invoked directly (CLAUDE_PROJECT_DIR may be unset).
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$PROJECT_DIR/grooming-watcher"

# This web image ships Chromium pre-installed (PLAYWRIGHT_BROWSERS_PATH) and the
# Playwright CDN is egress-blocked here, so skip the browser download. Use
# `npm install` (not `ci`) so the cached container layer is reused incrementally.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install

# Point Playwright at the pre-installed Chromium for any in-session test runs.
# (On GitHub Actions this var is unset and the matching browser is installed there.)
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x /opt/pw-browsers/chromium ]; then
  echo 'export PLAYWRIGHT_EXECUTABLE_PATH=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi

echo "grooming-watcher dependencies installed."
