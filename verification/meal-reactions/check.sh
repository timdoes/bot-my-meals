#!/usr/bin/env bash
# One command: verification/meal-reactions/check.sh
# Optional: check.sh broken | check.sh broken-ballot
set -euo pipefail

TLC_VERSION="1.8.0"
TLC_SHA256="e1f11b75c4b5bc4478ba0ac5cb6ae28e40a01b0016bc33e0aa97da22dfdbcd7f"
TLC_URL="https://github.com/tlaplus/tlaplus/releases/download/v${TLC_VERSION}/tla2tools.jar"

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
MODE="${1:-ok}"
SPEC="MealReactions"
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
  echo "Update verification/meal-reactions/MealReactions.tla or restore the guard." >&2
  exit 1
}

fingerprint() {
  grep -Fq "delete from public.saved_meals" \
    "$REPO/supabase/migrations/20261007020000_meal_reactions.sql" \
    || fail_fp "block_meal_on_never_again deletes favorite"
  grep -Fq "set never_again = false" \
    "$REPO/supabase/migrations/20261007020000_meal_reactions.sql" \
    || fail_fp "clear_never_again_for_favorite"
  grep -Fq "private.strip_blocked_saved_keys" \
    "$REPO/supabase/migrations/20261007020000_meal_reactions.sql" \
    || fail_fp "strip_blocked_saved_keys"
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
    expect_fail "${SPEC}Broken.cfg" "broken never-again trigger"
    ;;
  broken-ballot)
    expect_fail "${SPEC}BrokenBallot.cfg" "broken ballot strip"
    ;;
  *)
    echo "usage: $0 [ok|broken|broken-ballot]" >&2
    exit 2
    ;;
esac
