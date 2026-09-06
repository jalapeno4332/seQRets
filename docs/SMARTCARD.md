# JavaCard Smartcard Support

The desktop app supports storing Shamir shares, encrypted vaults, keyfiles, and encrypted inheritance plans on **JCOP3 JavaCard smartcards** (e.g., J3H145), providing tamper-resistant physical backups that survive fire, water, and digital threats.

## Hardware Requirements

- **Card:** JCOP3 J3H145 or compatible JavaCard 3.0.4+ smartcard (~110 KB usable EEPROM)
- **Reader:** Any PC/SC-compatible USB smart card reader

## Features

- **Write individual shares**, **full vaults**, **keyfiles**, or **encrypted inheritance plans** to a card via APDU over PC/SC
- **Read back** shares, vaults, or keyfiles directly from a card into the restore workflow
- **Multi-item storage** — store multiple items (shares, vaults, keyfiles, instructions) on a single card up to ~8 KB; new writes append to existing data
- **Per-item management** — view, select, and delete individual items from the Smart Card Manager page
- **Optional PIN protection** (8-16 characters) — card locks after 5 wrong attempts
- **PIN retry countdown** — real-time display of remaining PIN attempts (color-coded: gray → amber → red) across both the Smart Card Manager page and the smart card dialog
- **Generate PIN** — CSPRNG-powered 16-character PIN generator (upper/lowercase, numbers, symbols) with copy-to-clipboard and reveal/hide toggle
- **Data chunking** — automatically handles payloads larger than the 240-byte APDU limit
- **Clone card** — read all items from one card and write them to another card via the Smart Card Manager page; supports both single-reader (swap card) and dual-reader workflows with an optional destination PIN
- **Wipe protection** — on by default whenever a PIN is set; requires the PIN before the card can be
  factory-reset, so nobody holding the card can silently destroy a share (see below)
- **Erase** confirmation to prevent accidental data loss

## PIN, Wipe Protection, and Factory Reset

These three interact in a way that is easy to get wrong, so it is worth stating plainly.

**Reading always requires the PIN.** `READ_DATA` is PIN-gated whenever a PIN is set. The retry
counter is enforced by the JavaCard `OwnerPIN` object — it cannot be bypassed or rolled back by
software — and 5 wrong attempts lock the card for good.

**So losing the PIN destroys the data, wipe protection or not.** A locked card cannot be read
under any circumstances. This is the point people most often get backwards.

**What wipe protection changes is the card, not the data:**

| | Wipe protection OFF | Wipe protection ON (default) |
|---|---|---|
| Anyone holding the card + a reader | **can factory-reset it, no PIN needed** | blocked at the applet level — but see the GlobalPlatform caveat below |
| PIN lost or 5 attempts used up | data unreadable; card can be reset and reused | data unreadable; **card is a paperweight** |

The trade-off is therefore *availability of the share* against *reuse of the plastic*. For a card
holding one Qard of an inheritance set, that is not a close call: an unprotected card can be wiped
by whoever happens to hold it, which quietly turns a 2-of-3 into a 2-of-2 with nothing to show that
it happened. Wipe protection is enabled automatically when a PIN is set, with an opt-out presented
in the same step.

Wipe protection can only exist alongside a PIN — the applet refuses `SET_WIPE_PROTECT` when no PIN
is set (`SW_CONDITIONS_NOT_SATISFIED`), since there would be nothing to authenticate against.

A factory reset clears stored data, the label, the PIN, and the wipe-protection flag itself,
returning the card to a blank state. It never recovers data; it only makes the hardware reusable.

### ⚠️ Wipe protection depends on card personalisation

Wipe protection is enforced by the applet, and **GlobalPlatform sits underneath the applet.** A card
still carrying the published default GlobalPlatform key (`40 41 42 … 4F` — every blank JavaCard
ships with it, and `gp.jar` uses it automatically when given none) can have its applet, and
therefore all its data, deleted outright with no PIN. Wipe protection does not stop this, because
the attack is below it.

Verified on hardware 2026-09-06: a card with a PIN set, data stored, and wipe protection **enabled**
correctly refused `ERASE` at the applet level — and was then wiped anyway by a single GlobalPlatform
delete.

**So every claim on this page about a card resisting erasure is conditional on that card's
GlobalPlatform keys having been rotated.** That happens during personalisation, which is a blocking
step before any card ships — see [PERSONALIZATION.md](PERSONALIZATION.md). A card that has been
through it rejects the default key outright (`Card cryptogram invalid!`, confirmed independently on
a second, already-personalised card).

Confidentiality is unaffected either way: reading requires the PIN, and only ciphertext is ever
written to a card. This is purely an availability property — an unpersonalised card can be
destroyed or repurposed by whoever holds it, never read.

## APDU Instruction Set

All instructions use `CLA = 0x80`. Applet limits: 8 KB of stored data, 16-character PIN,
5 PIN retries.

| INS | Name | PIN required? |
|---|---|---|
| `0x01` | `STORE_DATA` — write a chunk (240-byte APDU limit) | yes, if a PIN is set |
| `0x02` | `READ_DATA` — read a chunk | yes, if a PIN is set |
| `0x03` | `GET_STATUS` — type, label, size, PIN state, retries, wipe flag | no |
| `0x04` | `ERASE_DATA` — factory reset | **only when wipe protection is on** |
| `0x10` | `SET_TYPE` — share / vault / keyfile / plan | yes, if a PIN is set |
| `0x11` | `SET_LABEL` | yes, if a PIN is set |
| `0x20` | `VERIFY_PIN` | n/a |
| `0x21` | `CHANGE_PIN` — requires the current PIN | yes |
| `0x22` | `SET_PIN` — only when no PIN is set yet | no |
| `0x23` | `SET_WIPE_PROTECT` — `P1` = `0x01` on / `0x00` off | yes, and a PIN must already exist |

The `0x04` row is the one worth reading twice: with wipe protection off, `ERASE_DATA` is
deliberately unauthenticated, so a card whose PIN has been lost can still be reclaimed as hardware.
That recovery path is exactly what wipe protection gives up.

## Applet Installation

The seQRets applet must be installed on each card before use. See [BUILDING.md](BUILDING.md#-javacard-applet-installation) for build and installation instructions.

## Applet AID

`F0 53 51 52 54 53 01 00 00` — selected automatically by the desktop app.
