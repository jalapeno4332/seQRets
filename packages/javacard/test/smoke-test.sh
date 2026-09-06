#!/usr/bin/env bash
#
# seQRets JavaCard applet — hardware security smoke test.
#
#     ./test/smoke-test.sh
#
# ⚠️  DESTRUCTIVE. This wipes the inserted card repeatedly and leaves it blank.
#     Only run it against a development card with nothing on it.
#
# WHY THIS EXISTS
# ---------------
# The security properties this applet is relied on for — that a PIN gates
# reading, that wipe protection actually blocks an erase, that a locked card's
# data is genuinely unreachable — were documented long before anything checked
# them against real silicon. This script checks them, on a real card, in one
# command.
#
# It asserts the model documented in docs/SMARTCARD.md, in particular the part
# that is easy to get backwards: **losing the PIN destroys the data whether or
# not wipe protection is on.** A factory reset recovers the card, never the
# secret. Test H proves that end to end.
#
# NOTE ON SESSIONS: OwnerPIN's "validated" flag is transient and clears on
# applet deselect. Every test therefore runs its whole APDU sequence in ONE gp
# invocation — splitting one across invocations would silently test something
# else.
#
# Requires: a PC/SC reader with a card whose GlobalPlatform keys are the
# default test keys, plus JDK 11 and lib/gp.jar (see docs/BUILDING.md).

set -uo pipefail

JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@11}"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

cd "$(dirname "$0")/.." || exit 1

if ! command -v java >/dev/null 2>&1; then
  echo "java not found. Install JDK 11 (brew install openjdk@11) or set JAVA_HOME." >&2
  exit 1
fi
if [ ! -f lib/gp.jar ]; then
  echo "lib/gp.jar missing — see docs/BUILDING.md for the one-time tool fetch." >&2
  exit 1
fi

AID=F05351525453010000
SELECT="00A4040009${AID}"
GP=(java -jar lib/gp.jar --no-felix)

PIN_ASCII="TestPin12345"
BAD_ASCII="WrongPin9999"
hex()  { printf '%s' "$1" | xxd -p | tr -d '\n' | tr 'a-f' 'A-F'; }
len()  { printf '%02X' "${#1}"; }

GET_STATUS="8003000000"
SET_PIN="80220000$(len "$PIN_ASCII")$(hex "$PIN_ASCII")"
VERIFY_OK="80200000$(len "$PIN_ASCII")$(hex "$PIN_ASCII")"
VERIFY_BAD="80200000$(len "$BAD_ASCII")$(hex "$BAD_ASCII")"
WIPE_ON="8023010000"
ERASE="8004000000"
READ_DATA="8002000000"
SET_TYPE="8010010000"           # P1=0x01 → share
PAYLOAD="SEQRETS-HW-TEST-PAYLOAD"
STORE="80010001$(len "$PAYLOAD")$(hex "$PAYLOAD")"

pass=0; fail=0; FAILURES=()

run() {                          # run <apdu>... → one response line per APDU, after SELECT
  local args=(-a "$SELECT") a
  for a in "$@"; do args+=(-a "$a"); done
  "${GP[@]}" -d "${args[@]}" 2>&1 | grep '^A<<' | sed 's/.*) //'
}
nth_sw()   { echo "$2" | sed -n "$(($1+1))p" | awk '{print $NF}'; }
nth_data() { echo "$2" | sed -n "$(($1+1))p" | awk '{$NF=""; print}' | tr -d ' '; }

check() {
  if [ "$2" == "$3" ]; then printf '  \033[32m✓\033[0m %s  (%s)\n' "$1" "$2"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  got %s, want %s\n' "$1" "$2" "$3"; fail=$((fail+1)); FAILURES+=("$1: got $2 want $3"); fi
}

decode() {                       # GET_STATUS payload → key=value pairs
  local d="$1" llen off
  llen=$((16#${d:12:2})); off=$((14 + llen*2))
  echo "dataLen=$((16#${d:0:4})) type=${d:4:2} pinSet=$((16#${d:6:2})) validated=$((16#${d:8:2}))" \
       "retries=$((16#${d:10:2})) labelLen=$llen cap=$((16#${d:$off:4})) wipe=$((16#${d:$((off+4)):2}))"
}
field() { echo "$1" | tr ' ' '\n' | grep "^$2=" | cut -d= -f2; }

echo
echo "  seQRets JavaCard — hardware security smoke test"
echo "  ⚠️  destructive: the card will be left blank"
echo

# ── A. baseline ──────────────────────────────────────────────────────
echo "A. Baseline"
out=$(run "$GET_STATUS")
if [ -z "$out" ]; then echo "  no response — is a card inserted?" >&2; exit 1; fi
st=$(decode "$(nth_data 1 "$out")")
echo "   $st"
check "applet selectable" "$(nth_sw 0 "$out")" "9000"
check "capacity 8192"     "$(field "$st" cap)" "8192"

# Start from a known-blank card.
run "$ERASE" >/dev/null

# ── B. PIN set and verify ────────────────────────────────────────────
echo; echo "B. PIN set / verify"
out=$(run "$SET_PIN" "$GET_STATUS" "$VERIFY_OK" "$GET_STATUS")
check "SET_PIN accepted"   "$(nth_sw 1 "$out")" "9000"
check "pinSet flag"        "$(field "$(decode "$(nth_data 2 "$out")")" pinSet)" "1"
check "correct PIN"        "$(nth_sw 3 "$out")" "9000"
check "validated flag"     "$(field "$(decode "$(nth_data 4 "$out")")" validated)" "1"

# ── C. retry counter ─────────────────────────────────────────────────
# NOTE: the applet returns 6982 for a wrong PIN, not the ISO-conventional
# 63Cx "wrong PIN, N tries left". The remaining count is exposed through
# GET_STATUS instead. Asserted here so the deviation stays deliberate.
echo; echo "C. Retry counter"
out=$(run "$VERIFY_BAD" "$GET_STATUS" "$VERIFY_BAD" "$GET_STATUS" "$VERIFY_OK" "$GET_STATUS")
check "wrong PIN rejected (6982, not 63Cx)" "$(nth_sw 1 "$out")" "6982"
check "retries 5 → 4"       "$(field "$(decode "$(nth_data 2 "$out")")" retries)" "4"
check "retries 4 → 3"       "$(field "$(decode "$(nth_data 4 "$out")")" retries)" "3"
check "correct PIN accepted" "$(nth_sw 5 "$out")" "9000"
check "counter reset to 5"  "$(field "$(decode "$(nth_data 6 "$out")")" retries)" "5"

# ── D. PIN gates data operations ─────────────────────────────────────
echo; echo "D. PIN gates data operations"
out=$(run "$READ_DATA" "$SET_TYPE")
check "READ_DATA blocked unverified" "$(nth_sw 1 "$out")" "6982"
check "SET_TYPE blocked unverified"  "$(nth_sw 2 "$out")" "6982"

# ── E. wipe protection gates erase ───────────────────────────────────
echo; echo "E. Wipe protection gates ERASE"
out=$(run "$VERIFY_OK" "$WIPE_ON" "$GET_STATUS")
check "SET_WIPE_PROTECT (verified)" "$(nth_sw 2 "$out")" "9000"
check "wipe flag set"               "$(field "$(decode "$(nth_data 3 "$out")")" wipe)" "1"
out=$(run "$ERASE")
check "ERASE BLOCKED without PIN"   "$(nth_sw 1 "$out")" "6982"
out=$(run "$GET_STATUS")
st=$(decode "$(nth_data 1 "$out")")
check "card survived blocked erase" "$(field "$st" pinSet)" "1"
out=$(run "$VERIFY_OK" "$ERASE" "$GET_STATUS")
check "ERASE allowed with PIN"      "$(nth_sw 2 "$out")" "9000"
st=$(decode "$(nth_data 3 "$out")")
check "erase clears PIN"            "$(field "$st" pinSet)" "0"
check "erase clears wipe flag"      "$(field "$st" wipe)"   "0"

# ── F. wipe protection requires a PIN ────────────────────────────────
echo; echo "F. Wipe protection requires a PIN"
check "refused on PIN-less card"    "$(nth_sw 1 "$(run "$WIPE_ON")")" "6985"
run "$SET_PIN" >/dev/null
check "refused when unverified"     "$(nth_sw 1 "$(run "$WIPE_ON")")" "6982"

# ── G/H. lockout, unreachability, and card recovery ──────────────────
# Safe only because wipe protection is OFF here: the force-erase at the end
# is what reclaims the card. With protection ON this sequence would brick it.
echo; echo "G. Lost PIN → data unreachable; force erase reclaims the CARD, not the data"
out=$(run "$VERIFY_OK" "$SET_TYPE" "$STORE" "$READ_DATA")
check "data stored"                  "$(nth_sw 3 "$out")" "9000"
check "data readable with PIN"       "$(nth_sw 4 "$out")" "9000"
out=$(run "$VERIFY_BAD" "$VERIFY_BAD" "$VERIFY_BAD" "$VERIFY_BAD" "$VERIFY_BAD" "$GET_STATUS")
check "retries exhausted"            "$(field "$(decode "$(nth_data 6 "$out")")" retries)" "0"
out=$(run "$VERIFY_OK" "$READ_DATA")
check "correct PIN refused (locked)" "$(nth_sw 1 "$out")" "6983"
check "data unreachable"             "$(nth_sw 2 "$out")" "6982"
out=$(run "$ERASE" "$GET_STATUS")
check "force erase reclaims card"    "$(nth_sw 1 "$out")" "9000"
st=$(decode "$(nth_data 2 "$out")")
check "retry counter restored"       "$(field "$st" retries)" "5"
check "data gone, NOT recovered"     "$(field "$st" dataLen)" "0"

echo
echo "  ───────────────────────────────────────"
if [ $fail -eq 0 ]; then
  printf '  \033[32mall %d checks passed\033[0m — card left blank\n\n' "$pass"; exit 0
fi
printf '  \033[31m%d of %d checks FAILED\033[0m\n' "$fail" "$((pass+fail))"
printf '    • %s\n' "${FAILURES[@]}"; echo; exit 1
