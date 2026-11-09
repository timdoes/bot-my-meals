#!/usr/bin/env bash
# One command: verification/bot-wake/check.sh
# Optional: check.sh broken | check.sh broken-create
set -euo pipefail

TLC_VERSION="1.8.0"
TLC_SHA256="e1f11b75c4b5bc4478ba0ac5cb6ae28e40a01b0016bc33e0aa97da22dfdbcd7f"
TLC_URL="https://github.com/tlaplus/tlaplus/releases/download/v${TLC_VERSION}/tla2tools.jar"

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
MODE="${1:-ok}"
SPEC="BotWake"
TOOLS="$ROOT/.tools"
JAR="$TOOLS/tla2tools-${TLC_VERSION}.jar"

ensure_jar() {
  mkdir -p "$TOOLS"
  if [[ -f "$JAR" ]]; then
    local have
    have="$(sha256sum "$JAR" | awk '{print $1}')"
    if [[ "$have" == "$TLC_SHA256" ]]; then
      return
    fi
    rm -f "$JAR"
  fi
  echo "Downloading TLA+ tools ${TLC_VERSION} (tla2tools.jar)"
  curl -fsSL -o "$JAR" "$TLC_URL"
  local got
  got="$(sha256sum "$JAR" | awk '{print $1}')"
  if [[ "$got" != "$TLC_SHA256" ]]; then
    echo "tla2tools.jar sha256 mismatch: $got" >&2
    rm -f "$JAR"
    exit 1
  fi
}

fail_fp() {
  echo "covered code no longer matches the model: $1" >&2
  echo "Update verification/bot-wake/BotWake.tla or restore the guard." >&2
  exit 1
}

fingerprint() {
  grep -Fq 'case "week_locked":' "$REPO/src/lib/bot-wake.ts" \
    || fail_fp "wakeAllowed week_locked"
  grep -Fq "return facts.weekLocked" "$REPO/src/lib/bot-wake.ts" \
    || fail_fp "wakeAllowed requires supabaseCurrentWeekLocked"
  grep -Fq 'return `${householdHost}:${event}`' "$REPO/src/lib/bot-wake.ts" \
    || fail_fp "debounceKey is householdHost:event"
  grep -Fq "store.mark(key, now.getTime())" "$REPO/src/lib/bot-wake.ts" \
    || fail_fp "postBotWake debounce mark"
  grep -Fq "FINISH_WAKE_BEFORE_CREATE" "$REPO/src/components/supper-provider.tsx" \
    || fail_fp "requestWeekBallot requires Wake your Bot"
}

run_tlc() {
  local cfg="$1"
  java -XX:+UseParallelGC -Xmx768m -cp "$JAR" tlc2.TLC \
    -config "$ROOT/$cfg" -workers 1 -cleanup \
    "$ROOT/${SPEC}.tla"
}

expect_fail() {
  local cfg="$1"
  local label="$2"
  local out
  out="$(mktemp)"
  set +e
  run_tlc "$cfg" >"$out" 2>&1
  local rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    cat "$out"
    echo "ERROR: $label passed; the property cannot fail (vacuous or model error)" >&2
    rm -f "$out"
    exit 1
  fi
  if ! grep -qE "Invariant .* is violated|Error: Invariant" "$out"; then
    cat "$out"
    echo "ERROR: $label failed, but not with an invariant violation" >&2
    rm -f "$out"
    exit 1
  fi
  echo "---- $label (expected fail) ----"
  grep -E "Invariant .* is violated|Error: Invariant|Error: The invariant" "$out" | head -n 20
  rm -f "$out"
}

command -v java >/dev/null || { echo "Java is required to run TLC." >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required to download tla2tools.jar." >&2; exit 1; }
ensure_jar

case "$MODE" in
  ok)
    fingerprint
    run_tlc "${SPEC}.cfg"
    ;;
  broken)
    expect_fail "${SPEC}Broken.cfg" "broken week_locked wakeAllowed"
    ;;
  broken-create)
    expect_fail "${SPEC}BrokenCreate.cfg" "broken FINISH_WAKE_BEFORE_CREATE"
    ;;
  *)
    echo "usage: $0 [ok|broken|broken-create]" >&2
    exit 2
    ;;
esac
