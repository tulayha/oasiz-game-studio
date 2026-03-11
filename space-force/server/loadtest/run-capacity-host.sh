#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="${SERVER_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
ENV_FILE="${ENV_FILE:-/root/.space-force-loadtest.env}"

if [ -f "${ENV_FILE}" ]; then
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
fi

if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR}/nvm.sh"
  nvm use >/dev/null 2>&1 || true
fi

ENDPOINT="${ENDPOINT:-${VITE_COLYSEUS_WS_URL:-}}"
RUNNER="${RUNNER:-lobbyfill}"
ROOM_CODE="${ROOM_CODE:-}"
STAGES="${STAGES:-8,16,24,32,40,48,56,64}"
USERS_PER_ROOM="${USERS_PER_ROOM:-4}"
WAIT_FOR_GROUP_MS="${WAIT_FOR_GROUP_MS:-}"
START_DELAY_MS="${START_DELAY_MS:-}"
START_FALLBACK_MS="${START_FALLBACK_MS:-}"
DURATION_SEC="${DURATION_SEC:-300}"
COOLDOWN_SEC="${COOLDOWN_SEC:-30}"
DELAY_MS="${DELAY_MS:-20}"
SUMMARY_INTERVAL_MS="${SUMMARY_INTERVAL_MS:-5000}"
REQUEST_TIMEOUT_MS="${REQUEST_TIMEOUT_MS:-15000}"
INPUT_DEBOUNCE_MS="${INPUT_DEBOUNCE_MS:-}"
OUT_ROOT="${OUT_ROOT:-/root/space-force-loadtest-runs}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}"
POLL_INTERVAL_SEC="${POLL_INTERVAL_SEC:-2}"
OPS_STATS_URL="${OPS_STATS_URL:-}"
OPS_STATS_TOKEN="${OPS_STATS_TOKEN:-}"
DO_DROPLET_INTERFACE="${DO_DROPLET_INTERFACE:-public}"
SLO_RTT_P95_MS="${SLO_RTT_P95_MS:-120}"
MAX_LEFT_UNCONSENTED_DELTA="${MAX_LEFT_UNCONSENTED_DELTA:-0}"
HEADROOM_RATIO="${HEADROOM_RATIO:-0.70}"
FAIL_ON_1006="${FAIL_ON_1006:-false}"
ENABLE_DASHBOARD="${ENABLE_DASHBOARD:-true}"

log() {
  echo "[space-force-capacity] $*"
}

fail() {
  echo "[space-force-capacity] ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

is_true() {
  case "${1,,}" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

read_iface_counters() {
  local iface="$1"
  awk -v i="$iface" '$1 ~ (i":") {print $2 " " $10; found=1; exit} END {if (!found) print "0 0"}' /proc/net/dev 2>/dev/null
}

stop_pid() {
  local pid="$1"
  if [ -z "$pid" ]; then
    return
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 0.2
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  fi
}

HOST_METRICS_PID=""
OPS_METRICS_PID=""
HOST_IFACE=""

cleanup() {
  stop_pid "${HOST_METRICS_PID}"
  stop_pid "${OPS_METRICS_PID}"
}
trap cleanup EXIT INT TERM

if [ -z "${ENDPOINT}" ]; then
  fail "ENDPOINT or VITE_COLYSEUS_WS_URL is required"
fi

if [ "${RUNNER}" = "roomcode" ] && [ -z "${ROOM_CODE}" ]; then
  fail "ROOM_CODE is required when RUNNER=roomcode"
fi

require_cmd npm
require_cmd node
require_cmd awk
require_cmd curl
require_cmd date
require_cmd tee

RUN_DIR="${OUT_ROOT}/${RUN_ID}"
LOADTEST_OUTPUT_DIR="${RUN_DIR}/loadtest"
HOST_METRICS_LOG="${RUN_DIR}/host-metrics.log"
OPS_METRICS_LOG="${RUN_DIR}/ops-stats.log"
RUN_META_PATH="${RUN_DIR}/run-meta.json"
CAPACITY_SUMMARY_JSON="${LOADTEST_OUTPUT_DIR}/capacity-summary.json"
CAPACITY_REPORT_JSON="${RUN_DIR}/capacity-report.json"
CAPACITY_REPORT_TXT="${RUN_DIR}/capacity-report.txt"
REPORT_SCRIPT="${SCRIPT_DIR}/build-capacity-report.mjs"
DASHBOARD_TEMPLATE_DIR="${SERVER_DIR}/capacity-runs/dashboard"
DASHBOARD_DIR="${OUT_ROOT}/dashboard"
DASHBOARD_INDEX_JSON="${OUT_ROOT}/index.json"

mkdir -p "${LOADTEST_OUTPUT_DIR}"

refresh_dashboard_assets() {
  if ! is_true "${ENABLE_DASHBOARD}"; then
    return
  fi

  if [ ! -f "${DASHBOARD_TEMPLATE_DIR}/index.html" ] || [ ! -f "${DASHBOARD_TEMPLATE_DIR}/app.js" ]; then
    log "WARN: dashboard templates not found at ${DASHBOARD_TEMPLATE_DIR}"
    return
  fi

  mkdir -p "${DASHBOARD_DIR}"
  cp -f "${DASHBOARD_TEMPLATE_DIR}/index.html" "${DASHBOARD_DIR}/index.html"
  cp -f "${DASHBOARD_TEMPLATE_DIR}/app.js" "${DASHBOARD_DIR}/app.js"

  set +e
  (
    cd "${SERVER_DIR}"
    npm run capacity:index -- --runsDir "${OUT_ROOT}"
  ) > "${RUN_DIR}/capacity-index.log" 2>&1
  local index_exit=$?
  set -e

  if [ "${index_exit}" -ne 0 ]; then
    log "WARN: capacity:index failed (exit=${index_exit}). See ${RUN_DIR}/capacity-index.log"
    return
  fi

  log "Dashboard updated: ${DASHBOARD_DIR}/index.html"
  log "Dashboard index: ${DASHBOARD_INDEX_JSON}"
}

start_host_metrics_loop() {
  local iface
  local prev_rx
  local prev_tx
  local rx
  local tx
  local drx
  local dtx
  local rx_bps
  local tx_bps

  iface="$(ip route show default 2>/dev/null | awk '/default/ {print $5; exit}')"
  if [ -z "$iface" ]; then
    iface="eth0"
  fi
  HOST_IFACE="$iface"

  read -r prev_rx prev_tx <<< "$(read_iface_counters "$iface")"

  (
    while true; do
      local ts
      local load1
      local mem_line
      local mem_used_mb
      local mem_used_pct

      ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      load1="$(awk '{print $1}' /proc/loadavg 2>/dev/null)"
      if [ -z "$load1" ]; then
        load1="0"
      fi

      mem_line="$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END {if (t > 0) {u=t-a; printf "%.1f %.2f", u/1024, (u*100/t)} else {printf "0.0 0.00"}}' /proc/meminfo 2>/dev/null)"
      read -r mem_used_mb mem_used_pct <<< "$mem_line"

      read -r rx tx <<< "$(read_iface_counters "$iface")"
      drx=$((rx - prev_rx))
      dtx=$((tx - prev_tx))
      if (( drx < 0 )); then drx=0; fi
      if (( dtx < 0 )); then dtx=0; fi
      prev_rx=$rx
      prev_tx=$tx
      rx_bps=$((drx / POLL_INTERVAL_SEC))
      tx_bps=$((dtx / POLL_INTERVAL_SEC))

      echo "$ts host.load1=$load1 host.memUsedMB=$mem_used_mb host.memUsedPct=$mem_used_pct net.rxBps=$rx_bps net.txBps=$tx_bps"
      sleep "$POLL_INTERVAL_SEC"
    done
  ) >> "$HOST_METRICS_LOG" 2>&1 &

  HOST_METRICS_PID="$!"
}

start_ops_poller() {
  if [ -z "${OPS_STATS_URL}" ]; then
    return
  fi

  (
    while true; do
      local ts
      local payload
      local parsed

      ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

      if [ -n "${OPS_STATS_TOKEN}" ]; then
        payload="$(curl -fsS -H "x-ops-token: ${OPS_STATS_TOKEN}" "${OPS_STATS_URL}" 2>/dev/null || true)"
      else
        payload="$(curl -fsS "${OPS_STATS_URL}" 2>/dev/null || true)"
      fi

      if [ -z "$payload" ]; then
        echo "$ts status=fetch_error"
        sleep "$POLL_INTERVAL_SEC"
        continue
      fi

      parsed="$(printf '%s' "$payload" | node -e '
let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => data += chunk);
process.stdin.on("end", () => {
  try {
    const p = JSON.parse(data);
    const clients = p?.clients?.active ?? -1;
    const rooms = p?.rooms?.active ?? -1;
    const leftUnconsented = p?.clients?.leftUnconsentedTotal ?? -1;
    const rttP95 = p?.rttMs?.p95 ?? -1;
    process.stdout.write("status=ok clients.active=" + clients + " rooms.active=" + rooms + " leftUnconsented=" + leftUnconsented + " rttP95ms=" + rttP95);
  } catch (_error) {
    process.stdout.write("status=parse_error payloadBytes=" + data.length);
  }
});
' 2>/dev/null || true)"

      if [ -z "$parsed" ]; then
        parsed="status=parse_error payloadBytes=${#payload}"
      fi

      echo "$ts $parsed"
      sleep "$POLL_INTERVAL_SEC"
    done
  ) >> "$OPS_METRICS_LOG" 2>&1 &

  OPS_METRICS_PID="$!"
}

STARTED_AT_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log "Run ID ${RUN_ID}"
log "Output directory ${RUN_DIR}"
log "Target endpoint ${ENDPOINT}"
log "Runner ${RUNNER} stages=${STAGES} usersPerRoom=${USERS_PER_ROOM} durationSec=${DURATION_SEC}"

start_host_metrics_loop
start_ops_poller

if [ -n "${INPUT_DEBOUNCE_MS}" ]; then
  export LOADTEST_INPUT_DEBOUNCE_MS="${INPUT_DEBOUNCE_MS}"
fi

cmd=(
  npm run loadtest:capacity --
  --runner "${RUNNER}"
  --endpoint "${ENDPOINT}"
  --stages "${STAGES}"
  --durationSec "${DURATION_SEC}"
  --cooldownSec "${COOLDOWN_SEC}"
  --delay "${DELAY_MS}"
  --summaryIntervalMs "${SUMMARY_INTERVAL_MS}"
  --requestTimeoutMs "${REQUEST_TIMEOUT_MS}"
  --outputDir "${LOADTEST_OUTPUT_DIR}"
)

if [ "${RUNNER}" = "roomcode" ]; then
  cmd+=(--roomCode "${ROOM_CODE}")
else
  cmd+=(--usersPerRoom "${USERS_PER_ROOM}")
  if [ -n "${WAIT_FOR_GROUP_MS}" ]; then
    cmd+=(--waitForGroupMs "${WAIT_FOR_GROUP_MS}")
  fi
  if [ -n "${START_DELAY_MS}" ]; then
    cmd+=(--startDelayMs "${START_DELAY_MS}")
  fi
  if [ -n "${START_FALLBACK_MS}" ]; then
    cmd+=(--startFallbackMs "${START_FALLBACK_MS}")
  fi
fi

if [ -n "${DO_API_TOKEN:-}" ] && [ -n "${DO_DROPLET_ID:-}" ]; then
  cmd+=(--doToken "${DO_API_TOKEN}" --doDropletId "${DO_DROPLET_ID}" --doInterface "${DO_DROPLET_INTERFACE}")
fi

set +e
(
  cd "${SERVER_DIR}"
  "${cmd[@]}"
) 2>&1 | tee "${RUN_DIR}/capacity-run.log"
LOADTEST_EXIT="${PIPESTATUS[0]}"
set -e

ENDED_AT_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

CAPACITY_REPORT_GENERATED=false
set +e
node "${REPORT_SCRIPT}" \
  --summary "${CAPACITY_SUMMARY_JSON}" \
  --ops "${OPS_METRICS_LOG}" \
  --out-json "${CAPACITY_REPORT_JSON}" \
  --out-txt "${CAPACITY_REPORT_TXT}" \
  --run-id "${RUN_ID}" \
  --endpoint "${ENDPOINT}" \
  --users-per-room "${USERS_PER_ROOM}" \
  --headroom-ratio "${HEADROOM_RATIO}" \
  --slo-rtt-p95-ms "${SLO_RTT_P95_MS}" \
  --max-left-unconsented-delta "${MAX_LEFT_UNCONSENTED_DELTA}" \
  --fail-on-1006 "${FAIL_ON_1006}" | tee "${RUN_DIR}/capacity-report.stdout.log"
CAPACITY_REPORT_EXIT=$?
set -e
if [ "${CAPACITY_REPORT_EXIT}" -eq 0 ]; then
  CAPACITY_REPORT_GENERATED=true
else
  log "WARN: capacity report generation failed (exit=${CAPACITY_REPORT_EXIT})"
fi

DASHBOARD_ENABLED_JSON=false
if is_true "${ENABLE_DASHBOARD}"; then
  DASHBOARD_ENABLED_JSON=true
fi

cat > "${RUN_META_PATH}" <<META_EOF
{
  "runId": "${RUN_ID}",
  "startedAtIso": "${STARTED_AT_ISO}",
  "endedAtIso": "${ENDED_AT_ISO}",
  "endpoint": "${ENDPOINT}",
  "runner": "${RUNNER}",
  "stages": "${STAGES}",
  "usersPerRoom": "${USERS_PER_ROOM}",
  "durationSec": "${DURATION_SEC}",
  "cooldownSec": "${COOLDOWN_SEC}",
  "delayMs": "${DELAY_MS}",
  "summaryIntervalMs": "${SUMMARY_INTERVAL_MS}",
  "requestTimeoutMs": "${REQUEST_TIMEOUT_MS}",
  "inputDebounceMs": "${INPUT_DEBOUNCE_MS}",
  "opsStatsUrl": "${OPS_STATS_URL}",
  "pollIntervalSec": "${POLL_INTERVAL_SEC}",
  "hostIface": "${HOST_IFACE}",
  "loadtestExitCode": ${LOADTEST_EXIT},
  "capacityReportGenerated": ${CAPACITY_REPORT_GENERATED},
  "capacityReportJsonPath": "${CAPACITY_REPORT_JSON}",
  "capacityReportTextPath": "${CAPACITY_REPORT_TXT}",
  "dashboardEnabled": ${DASHBOARD_ENABLED_JSON},
  "dashboardDir": "${DASHBOARD_DIR}",
  "dashboardIndexPath": "${DASHBOARD_INDEX_JSON}"
}
META_EOF

refresh_dashboard_assets

if [ "${LOADTEST_EXIT}" -ne 0 ]; then
  log "Capacity sweep failed (exit=${LOADTEST_EXIT})"
  if [ "${CAPACITY_REPORT_GENERATED}" = "true" ]; then
    log "Capacity report: ${CAPACITY_REPORT_TXT}"
  fi
  log "Artifacts: ${RUN_DIR}"
  exit "${LOADTEST_EXIT}"
fi

log "Capacity sweep complete"
if [ "${CAPACITY_REPORT_GENERATED}" = "true" ]; then
  log "Capacity report: ${CAPACITY_REPORT_TXT}"
fi
if is_true "${ENABLE_DASHBOARD}"; then
  log "Dashboard: ${DASHBOARD_DIR}/index.html"
  log "Serve dashboard with: python3 -m http.server --directory ${OUT_ROOT} 8787"
fi
log "Artifacts: ${RUN_DIR}"
