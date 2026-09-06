#!/usr/bin/env bash
#
# seQRets JavaCard — production personalisation, one card.
#
#     ./personalize.sh
#
# Installs the applet, proves it works, then rotates the card's GlobalPlatform
# keys to a random value and FORGETS IT. After this runs, the card's applet can
# never be altered, reinstalled or deleted by anyone — including us.
#
# WHY IT WORKS THIS WAY
# ---------------------
# Blank JavaCards ship with the published default GP key (40 41 42 … 4F). That
# key is in the GlobalPlatform spec, in every tutorial, and is what gp.jar uses
# when you give it none. Left in place, anyone holding the card and a reader can
# delete the applet outright — destroying that Qard without the PIN and without
# a trace, because GlobalPlatform sits *underneath* the applet's wipe
# protection. Verified on hardware: a card with wipe protection ON and data
# stored was wiped in one command.
#
# We ship one-way (a defective card is replaced, never returned), so a retained
# master key could only ever be a liability: a secret to guard for decades in
# exchange for a capability we would never use. So each card gets its own random
# key, which exists for about two seconds and is then gone.
#
# THE ORDER IS NOT NEGOTIABLE
# ---------------------------
#   install -> smoke test -> generate key -> rotate -> VERIFY -> forget
#
# You cannot verify a key you have already destroyed, so the verification sits
# between rotation and destruction. And the smoke test must pass BEFORE
# rotation, because rotation is the last moment anything about this card can be
# changed. After it, a defective card is scrap.
#
# We deliberately do NOT test that the default keys have stopped working. A
# failed GP authentication burns an attempt against the security domain and can
# brick the card. It also proves nothing: if authenticating with the new random
# key succeeds, the keys are no longer the default ones.
#
# Requires JDK 11, lib/gp.jar, and a PC/SC reader. See docs/PERSONALIZATION.md.

set -uo pipefail

JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@11}"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

cd "$(dirname "$0")" || exit 1

CAP="build/SeQRetsApplet.cap"
AID=F05351525453010000
PKG=F053515254530100
DEFAULT_KEY=404142434445464748494A4B4C4D4E4F
# Manufacturing record. Serial + date + applet version + QA result — never a key.
# Kept out of git: shipment volumes are nobody else's business.
LOG="${SEQRETS_PERSO_LOG:-$(dirname "$0")/personalization-log.tsv}"

GP=(java -jar lib/gp.jar)

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
dim()   { printf '\033[2m%s\033[0m\n' "$1"; }
die()   { red "  ✗ $1"; exit 1; }

echo
echo "  seQRets card personalisation"
echo "  ─────────────────────────────"

[ -f "$CAP" ] || die "$CAP not found — run 'ant clean build' first."
command -v java >/dev/null 2>&1 || die "java not found (need JDK 11)."

# ── 1. identify the card ─────────────────────────────────────────────
info=$("${GP[@]}" --info 2>&1)
SERIAL=$(echo "$info" | awk -F= '/ICSerialNumber/{gsub(/ /,"",$2); print $2}')
ICTYPE=$(echo "$info" | awk -F= '/ICType/{gsub(/ /,"",$2); print $2}')
[ -n "$SERIAL" ] || die "No card detected in the reader."
echo "  card serial : $SERIAL  (ICType $ICTYPE)"

# ── 2. refuse to touch an already-personalised card ──────────────────
# If the default key no longer authenticates, this card has been through here
# before (or is not ours). Either way, stop: we cannot manage it and must not
# burn further auth attempts against it.
if ! "${GP[@]}" --list >/dev/null 2>&1; then
  die "Default GP keys do not authenticate — this card is already personalised
       (or is not a blank dev card). Refusing to continue. Do NOT retry: repeated
       failed GP authentication can permanently brick card management."
fi
green "  ✓ blank card, default keys present"

# ── 3. install the applet ────────────────────────────────────────────
# Remove any prior copy first so this is idempotent across re-runs.
"${GP[@]}" --uninstall "$CAP" >/dev/null 2>&1
"${GP[@]}" --install "$CAP" >/dev/null 2>&1 \
  || die "Applet installation failed."
"${GP[@]}" --list 2>/dev/null | grep -q "$AID (SELECTABLE)" \
  || die "Applet installed but not selectable."
green "  ✓ applet installed and selectable"

# ── 4. QA gate — the last moment anything can be fixed ───────────────
echo
dim "  running hardware smoke test (30 checks)…"
if ! ./test/smoke-test.sh >/tmp/seqrets-perso-smoke.$$ 2>&1; then
  tail -20 /tmp/seqrets-perso-smoke.$$
  rm -f /tmp/seqrets-perso-smoke.$$
  die "Smoke test FAILED — card not personalised. Scrap it or investigate."
fi
rm -f /tmp/seqrets-perso-smoke.$$
green "  ✓ smoke test passed (30/30)"

# ── 5. rotate to a random key, verify, forget ────────────────────────
echo
dim "  rotating GlobalPlatform keys…"

# TEST MODE — validating the line, not personalising stock. Uses a key you
# supply instead of a random one and does NOT destroy it, so the card can be
# rotated back to default afterwards. Never use this on customer cards: the
# whole security property is that nobody knows the key.
TESTMODE=0
if [ -n "${SEQRETS_PERSO_TEST_KEY:-}" ]; then
  TESTMODE=1
  KEY="$SEQRETS_PERSO_TEST_KEY"
  echo
  red   "  ╔══════════════════════════════════════════════════════════════╗"
  red   "  ║  TEST MODE — using a CALLER-SUPPLIED key, NOT destroying it.  ║"
  red   "  ║  The resulting card is NOT secure and MUST NOT be shipped.    ║"
  red   "  ╚══════════════════════════════════════════════════════════════╝"
  echo
else
  # CSPRNG, 16 bytes: covers SCP02 (3DES) and SCP03 (AES-128). Held only in this
  # variable, never written to disk, never echoed, never in shell history.
  KEY=$(openssl rand -hex 16 | tr 'a-f' 'A-F')
fi
[ ${#KEY} -eq 32 ] || die "Key must be 32 hex characters (16 bytes)."

# gp prints the new key on success ("locked with: …"). Swallow its output
# entirely so the key never reaches the terminal, scrollback, or a log file.
if ! "${GP[@]}" --lock "$KEY" >/dev/null 2>&1; then
  die "Key rotation FAILED. The card is still on default keys — safe to retry."
fi

# THE step. If this passes, rotation took and the key was correct. If it fails,
# we hold a card whose key we are about to forget: say so loudly.
if ! "${GP[@]}" --key "$KEY" --list >/dev/null 2>&1; then
  KEY=""
  die "Rotation reported success but the new key does NOT authenticate.
       This card can no longer be managed. SCRAP IT — do not ship it."
fi
green "  ✓ keys rotated and verified"

if [ "$TESTMODE" -eq 1 ]; then
  red "  ! TEST MODE: key NOT destroyed. Restore the card with:"
  dim "      java -jar lib/gp.jar --key \$SEQRETS_PERSO_TEST_KEY --lock $DEFAULT_KEY"
else
  KEY=""          # point of no return
  unset KEY
  green "  ✓ key destroyed — this card is now immutable"
fi

# ── 6. the applet still answers (no GP auth needed for this) ─────────
# Selecting an applet and talking to it needs no secure channel, so this works
# with the key already forgotten. NOTE: gp itself exits non-zero here with
# "Error: no keys given" — that is gp failing its own post-run card-manager
# step, NOT the applet failing. So we ignore gp's exit code and judge the card
# on the APDU response, which is the only thing that actually matters.
probe=$("${GP[@]}" -d --no-felix -a "00A4040009${AID}" -a 8003000000 2>&1 \
        | grep '^A<<' | sed 's/.*) //')
sel_sw=$(echo "$probe" | sed -n '1p' | awk '{print $NF}')
status=$(echo "$probe" | sed -n '2p' | awk '{$NF=""; print}' | tr -d ' ')
[ "$sel_sw" = "9000" ] || die "Applet no longer selectable after rotation. SCRAP THIS CARD."
# A shippable card is blank: no data, no PIN, full retry counter.
[ "${status:0:4}" = "0000" ] || die "Card is not blank after rotation (dataLen != 0). SCRAP THIS CARD."
[ "${status:6:2}" = "00" ]   || die "Card still has a PIN set after rotation. SCRAP THIS CARD."
[ "${status:10:2}" = "05" ]  || die "PIN retry counter is not 5. SCRAP THIS CARD."
green "  ✓ applet responds, card is blank and ready to ship"

# ── 7. manufacturing record ──────────────────────────────────────────
APPLET_VER=$(git -C ../.. log -1 --format=%h -- packages/javacard/src 2>/dev/null || echo unknown)
[ -f "$LOG" ] || echo -e "date\tserial\tictype\tapplet_commit\tsmoke\trotated" > "$LOG"
printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SERIAL" "$ICTYPE" "$APPLET_VER" "pass" \
  "$([ "$TESTMODE" -eq 1 ] && echo 'TEST-DO-NOT-SHIP' || echo 'yes')" >> "$LOG"

echo
green "  card $SERIAL personalised and ready"
dim   "  logged to $LOG"
echo
