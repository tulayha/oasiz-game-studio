#!/usr/bin/env bash
# Single-command launcher: starts HTTP dashboard server + runs the capacity sweep.
# Usage: bash run-capacity-with-dashboard.sh [run-capacity-host.sh args...]
#
# Env vars:
#   OUT_ROOT         - run output root (default: /root/space-force-loadtest-runs)
#   DASHBOARD_PORT   - HTTP port for the dashboard (default: 8787)
#   All ENDPOINT/RUNNER/STAGES/etc vars are forwarded to run-capacity-host.sh
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_ROOT="${OUT_ROOT:-/root/space-force-loadtest-runs}"
DASHBOARD_PORT="${DASHBOARD_PORT:-8787}"
DASHBOARD_HOST="${DASHBOARD_HOST:-0.0.0.0}"

log() {
  echo "[space-force-capacity] $*"
}

mkdir -p "${OUT_ROOT}"

# Start the HTTP server serving the runs root in the background.
python3 -m http.server "${DASHBOARD_PORT}" --bind "${DASHBOARD_HOST}" --directory "${OUT_ROOT}" \
  >/dev/null 2>&1 &
HTTP_PID="$!"

cleanup() {
  if kill -0 "${HTTP_PID}" >/dev/null 2>&1; then
    kill "${HTTP_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

log "Dashboard server started on port ${DASHBOARD_PORT}"
log "Open: http://localhost:${DASHBOARD_PORT}/dashboard/"
log "Dashboard auto-refreshes every 15s — no need to stay in the terminal."
log ""

bash "${SCRIPT_DIR}/run-capacity-host.sh" "$@"
SWEEP_EXIT=$?
exit "${SWEEP_EXIT}"
