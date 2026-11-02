#!/usr/bin/env bash
# Launch, doctor, and cleanup for Bot My Meals verification.
# Never points at production or managed Supabase. Default launch leaves
# NEXT_PUBLIC_SUPABASE_* unset so the setup gate is the usable state.
set -euo pipefail

APP_PORT=43147
APP_HOST=127.0.0.1
APP_URL="http://${APP_HOST}:${APP_PORT}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="${SKILL_DIR}"
while [[ "${REPO_ROOT}" != "/" && ! -f "${REPO_ROOT}/package.json" ]]; do
  REPO_ROOT="$(cd "${REPO_ROOT}/.." && pwd)"
done
if [[ ! -f "${REPO_ROOT}/package.json" ]]; then
  echo "verify.sh: could not find package.json above ${SKILL_DIR}" >&2
  exit 2
fi

if [[ -z "${VERIFY_RUN_ID:-}" ]]; then
  echo "verify.sh: set VERIFY_RUN_ID to a disposable id (example: verify-20261102-setup)" >&2
  exit 2
fi

RUN_DIR="/tmp/verify-bot-my-meals/runs/${VERIFY_RUN_ID}"
EVIDENCE_DIR="/tmp/verify-bot-my-meals/evidence/${VERIFY_RUN_ID}"
PIDFILE="${RUN_DIR}/dev.pid"
LOGFILE="${RUN_DIR}/dev.log"
ENVFILE="${RUN_DIR}/launch.env"

forbidden_supabase_url() {
  local url="${1:-}"
  [[ -z "${url}" ]] && return 1
  local lower
  lower="$(printf '%s' "${url}" | tr '[:upper:]' '[:lower:]')"
  case "${lower}" in
    http://127.0.0.1:*|http://localhost:*|http://[::1]:*)
      return 1
      ;;
    https://127.0.0.1:*|https://localhost:*|https://[::1]:*)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

assert_verification_env() {
  local url="${NEXT_PUBLIC_SUPABASE_URL:-}"
  if forbidden_supabase_url "${url}"; then
    echo "verify.sh: refusing NEXT_PUBLIC_SUPABASE_URL=${url}" >&2
    echo "verify.sh: verification never uses production or managed Supabase (no *.supabase.co, no hosted household)." >&2
    echo "verify.sh: leave both keys unset (setup gate), or point only at local Supabase/Postgres on loopback." >&2
    exit 3
  fi
  if [[ -n "${url}" && -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
    echo "verify.sh: partial keys are an incomplete install; unset both or set both from a local project." >&2
    exit 3
  fi
}

port_pids() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :${APP_PORT}" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | sort -u
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"${APP_PORT}" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  return 0
}

# Children of a pid, then their children. Used so cleanup can stop next-server
# after npm exits, without pkill -f next.
descendants() {
  local p="$1"
  local child
  for child in $(pgrep -P "${p}" 2>/dev/null || true); do
    printf '%s\n' "${child}"
    descendants "${child}"
  done
}

collect_kill_pids() {
  local root="$1"
  {
    printf '%s\n' "${root}"
    descendants "${root}"
    port_pids
    if [[ -f "${RUN_DIR}/kill.pids" ]]; then
      cat "${RUN_DIR}/kill.pids"
    fi
  } | sed '/^$/d' | sort -u
}

stop_pids() {
  local pid
  for pid in "$@"; do
    [[ -n "${pid}" ]] || continue
    if kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
  done
  local deadline=$((SECONDS + 10))
  local leftover=0
  for pid in "$@"; do
    while kill -0 "${pid}" 2>/dev/null && (( SECONDS < deadline )); do
      leftover=1
      sleep 0.2
    done
    if kill -0 "${pid}" 2>/dev/null; then
      kill -9 "${pid}" 2>/dev/null || true
    fi
  done
  unset leftover
}

http_get() {
  local dest="$1"
  curl -sS -D "${dest}.headers" -o "${dest}.body" -w "%{http_code}" --max-time 8 "${APP_URL}/"
}

cmd_launch() {
  assert_verification_env
  mkdir -p "${RUN_DIR}" "${EVIDENCE_DIR}"
  if [[ -f "${PIDFILE}" ]] && kill -0 "$(cat "${PIDFILE}")" 2>/dev/null; then
    echo "verify.sh: already launched pid $(cat "${PIDFILE}") for ${VERIFY_RUN_ID}"
    cmd_doctor
    return
  fi

  local existing
  existing="$(port_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [[ -n "${existing}" ]]; then
    echo "verify.sh: port ${APP_PORT} is already in use by pid(s) ${existing}" >&2
    echo "verify.sh: refuse to double-drive a shared instance. Stop that process or pick another checkout." >&2
    exit 4
  fi

  if [[ ! -d "${REPO_ROOT}/node_modules" ]]; then
    echo "verify.sh: node_modules missing; run npm ci from ${REPO_ROOT} first." >&2
    exit 5
  fi

  # Default verification launch: no public keys, no wake secrets, no service-role.
  # A local loopback URL is allowed only when the caller exported it themselves.
  {
    echo "VERIFY_RUN_ID=${VERIFY_RUN_ID}"
    echo "APP_URL=${APP_URL}"
    echo "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-}"
    echo "LAUNCHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"${ENVFILE}"

  (
    cd "${REPO_ROOT}"
    unset BOT_WAKE_WEBHOOK_URL BOT_WAKE_WEBHOOK_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
    unset NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY SUPABASE_SERVICE_ROLE_KEY
    if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ]]; then
      unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
    fi
    exec npm run dev
  ) >"${LOGFILE}" 2>&1 &
  echo $! >"${PIDFILE}"

  local deadline=$((SECONDS + 90))
  local code=""
  while (( SECONDS < deadline )); do
    if ! kill -0 "$(cat "${PIDFILE}")" 2>/dev/null; then
      echo "verify.sh: npm run dev exited early. log: ${LOGFILE}" >&2
      tail -n 80 "${LOGFILE}" >&2 || true
      exit 6
    fi
    if code="$(http_get "${RUN_DIR}/ready" 2>/dev/null)" && [[ "${code}" =~ ^[23][0-9][0-9]$ ]]; then
      break
    fi
    sleep 1
  done

  if [[ ! "${code}" =~ ^[23][0-9][0-9]$ ]]; then
    echo "verify.sh: app did not become ready at ${APP_URL} within 90s. log: ${LOGFILE}" >&2
    tail -n 80 "${LOGFILE}" >&2 || true
    exit 6
  fi

  collect_kill_pids "$(cat "${PIDFILE}")" >"${RUN_DIR}/kill.pids"

  echo "verify.sh: launched pid $(cat "${PIDFILE}") at ${APP_URL} (http ${code})"
  echo "verify.sh: tree $(tr '\n' ' ' <"${RUN_DIR}/kill.pids")"
  echo "verify.sh: log ${LOGFILE}"
  echo "verify.sh: evidence ${EVIDENCE_DIR}"
}

cmd_doctor() {
  assert_verification_env
  if [[ ! -f "${PIDFILE}" ]]; then
    echo "verify.sh doctor: FAIL no pidfile at ${PIDFILE}" >&2
    exit 7
  fi
  local pid
  pid="$(cat "${PIDFILE}")"
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "verify.sh doctor: FAIL pid ${pid} is not running" >&2
    exit 7
  fi

  local owners
  owners="$(port_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [[ -n "${owners}" && " ${owners} " != *" ${pid} "* ]]; then
    # next may spawn a child that actually binds the port
    local child_ok=0
    local owner
    for owner in ${owners}; do
      if [[ "$(ps -o ppid= -p "${owner}" 2>/dev/null | tr -d ' ')" == "${pid}" ]]; then
        child_ok=1
      fi
    done
    if [[ "${child_ok}" -ne 1 ]]; then
      echo "verify.sh doctor: FAIL port ${APP_PORT} is not owned by pid ${pid} (owners: ${owners})" >&2
      exit 7
    fi
  fi

  local code
  code="$(http_get "${RUN_DIR}/doctor")"
  local body="${RUN_DIR}/doctor.body"
  if [[ ! "${code}" =~ ^[23][0-9][0-9]$ ]]; then
    echo "verify.sh doctor: FAIL ${APP_URL} returned ${code}" >&2
    exit 7
  fi

  if ! grep -q "Bot My Meals\|Set up the real house\|data-slot=\"backend-setup-gate\"" "${body}"; then
    echo "verify.sh doctor: FAIL ${APP_URL} did not look like Bot My Meals" >&2
    exit 7
  fi

  local mode="unknown"
  if grep -q 'data-setup-status="missing"' "${body}" || grep -q "Set up the real house" "${body}"; then
    mode="setup-gate-missing-keys"
  elif grep -q 'data-setup-status="ready"' "${body}"; then
    mode="keys-ready"
  elif grep -q "Set up this house\|Create household\|Create this week's meals" "${body}"; then
    mode="signed-in-or-house-setup"
  fi

  echo "verify.sh doctor: OK"
  echo "  run_id:    ${VERIFY_RUN_ID}"
  echo "  pid:       ${pid}"
  echo "  url:       ${APP_URL}"
  echo "  http:      ${code}"
  echo "  mode:      ${mode}"
  echo "  supabase:  ${NEXT_PUBLIC_SUPABASE_URL:-<unset — setup gate>}"
  echo "  evidence:  ${EVIDENCE_DIR}"
  echo "  log:       ${LOGFILE}"
}

cmd_cleanup() {
  local pid=""
  if [[ -f "${PIDFILE}" ]]; then
    pid="$(cat "${PIDFILE}")"
  fi
  local to_kill=""
  if [[ -n "${pid}" ]]; then
    to_kill="$(collect_kill_pids "${pid}")"
  elif [[ -f "${RUN_DIR}/kill.pids" ]]; then
    to_kill="$(cat "${RUN_DIR}/kill.pids")"
  fi
  if [[ -n "${to_kill}" ]]; then
    # shellcheck disable=SC2086
    stop_pids ${to_kill}
    echo "verify.sh: stopped pids $(echo "${to_kill}" | tr '\n' ' ')"
  else
    echo "verify.sh: no pidfile; nothing started by this run"
  fi
  rm -rf "${RUN_DIR}"
  echo "verify.sh: removed ${RUN_DIR}"
  echo "verify.sh: kept evidence at ${EVIDENCE_DIR}"
  local leftover
  leftover="$(port_pids | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  if [[ -n "${leftover}" ]]; then
    echo "verify.sh: port ${APP_PORT} still listening on pid(s) ${leftover}" >&2
    exit 8
  fi
}

usage() {
  echo "Usage: VERIFY_RUN_ID=<id> $0 launch|doctor|cleanup" >&2
  exit 2
}

case "${1:-}" in
  launch) cmd_launch ;;
  doctor) cmd_doctor ;;
  cleanup) cmd_cleanup ;;
  *) usage ;;
esac
