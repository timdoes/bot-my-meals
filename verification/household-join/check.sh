#!/usr/bin/env bash
# One command: verification/household-join/check.sh
# Optional: check.sh broken | check.sh broken-token | check.sh finding (former finding, now pass)
set -euo pipefail

TLC_VERSION="1.8.0"
TLC_SHA256="e1f11b75c4b5bc4478ba0ac5cb6ae28e40a01b0016bc33e0aa97da22dfdbcd7f"
TLC_URL="https://github.com/tlaplus/tlaplus/releases/download/v${TLC_VERSION}/tla2tools.jar"

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
MODE="${1:-ok}"
SPEC="HouseholdJoin"
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
  echo "Update verification/household-join/HouseholdJoin.tla or restore the guard." >&2
  exit 1
}

fingerprint() {
  grep -Fq "You are already in a house." \
    "$REPO/supabase/migrations/20260917140000_house_setup_join_tokens.sql" \
    || fail_fp "claim_join_token one-house guard"
  grep -Fq "You are already in a house." \
    "$REPO/supabase/migrations/20261108210200_join_one_household.sql" \
    || fail_fp "claim_pending_invites / join_household_by_code one-house guard"
  grep -Fq "Keep at least one Admin." \
    "$REPO/supabase/migrations/20260909130000_manage_members.sql" \
    || fail_fp "protect_last_owner"
  grep -Fq "This invite link has expired" \
    "$REPO/supabase/migrations/20260917140000_house_setup_join_tokens.sql" \
    || fail_fp "claim_join_token expired"
  grep -Fq "This invite link was already used" \
    "$REPO/supabase/migrations/20260917140000_house_setup_join_tokens.sql" \
    || fail_fp "claim_join_token used"
  grep -Fq "add constraint memberships_one_user unique (user_id)" \
    "$REPO/supabase/migrations/20261109012000_memberships_one_user.sql" \
    || fail_fp "memberships unique(user_id)"
  grep -Fq "This migration does not delete or merge those rows" \
    "$REPO/supabase/migrations/20261109012000_memberships_one_user.sql" \
    || fail_fp "memberships_one_user preflight (no data repair)"
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
    expect_fail "${SPEC}Broken.cfg" "broken last-admin protection"
    ;;
  broken-token)
    expect_fail "${SPEC}BrokenToken.cfg" "broken join-token status guard"
    ;;
  finding)
    fingerprint
    run_tlc "${SPEC}Finding.cfg"
    ;;
  *)
    echo "usage: $0 [ok|broken|broken-token|finding]" >&2
    exit 2
    ;;
esac
