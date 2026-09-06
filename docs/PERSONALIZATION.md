# Card Personalisation

How a blank JavaCard becomes a card we are willing to put in a customer's hands.

> **One command per card:**
> ```bash
> cd packages/javacard && ./personalize.sh
> ```
> It installs the applet, runs the 30-check hardware smoke test, rotates the
> card's GlobalPlatform keys to a random value, verifies the rotation, and then
> forgets the key. Every step is a gate: any failure stops the card.

---

## Why this exists

Blank JavaCards ship with the **published default GlobalPlatform key**,
`40 41 42 … 4F`. It is in the GlobalPlatform specification, in every JavaCard
tutorial, and is what `gp.jar` uses automatically when you give it none — it
announces it:

```
# Warning: no keys given, defaulting to 404142434445464748494A4B4C4D4E4F
```

GlobalPlatform is the card-management layer that sits **underneath** the applet.
Left on default keys, anyone holding the card and a reader can delete the applet
outright — which destroys the stored Qard without the PIN, without wipe
protection stopping them, and without leaving a trace.

This is not theoretical. It was verified on hardware (2026-09-06): a card with a
PIN set, data stored, and **wipe protection enabled** — with `ERASE` correctly
refused at the applet level — was wiped anyway with a single GlobalPlatform
delete. Wipe protection cannot defend against this, because the attack happens
below the applet.

Two things follow, and both matter:

1. **Wipe protection is only as real as personalisation.** Every claim we make
   about a card resisting erasure is conditional on its keys being rotated.
2. **Factory keys also allow installing a hostile applet.** Someone in the
   supply chain could replace ours with a lookalike before the card reaches the
   customer. Rotation closes that door too.

**Confidentiality is unaffected either way.** Reading a card requires the applet
PIN, and only ciphertext is ever written to a card. An attacker with a blank-key
card can destroy a Qard or take the card for themselves; they cannot learn the
secret.

## Why the key is destroyed rather than kept

seQRets ships cards **one way**. A defective card is replaced with a new one; it
never comes back. A retained master key would therefore be a secret we must
protect for decades in exchange for a capability we would never use — and one
whose leak would compromise every card ever shipped.

So each card gets its own random key, held for about two seconds and then
discarded. This makes the process *simpler*, not harder: no master key, no key
diversification, no key custody, no "survives a house fire and survives you"
backup problem, no leak radius.

The consequence, accepted deliberately: **after personalisation the card's
applet can never be altered, reinstalled or deleted by anyone, including us.**
For an artifact meant to sit in a drawer for decades, that is the honest
posture.

## The order is not negotiable

```
1. identify card            serial recorded for the manufacturing log
2. guard                    refuse if default keys no longer authenticate
3. install applet
4. smoke test               30 checks — THE LAST QA GATE, EVER
5. generate random key      CSPRNG, 16 bytes, memory only
6. rotate
7. VERIFY with the new key  ← must pass before the key is discarded
8. forget the key           point of no return
9. confirm the applet still answers and the card is blank
10. append to the manufacturing log (never the key)
```

**Step 7 must sit between rotation and destruction.** You cannot verify a key
you have already destroyed. A rotation that "succeeded" but left the card on a
key you did not record is indistinguishable from success until the moment you
need it — the same failure mode as assuming a certificate purchase means your
binary is signed.

**Step 4 is the last moment anything can be fixed.** After step 8 a defective
card is scrap.

## What the script deliberately does *not* do

- **It never tests that the default keys stopped working.** A failed
  GlobalPlatform authentication burns an attempt against the card's security
  domain and can permanently brick card management — `gp` warns about exactly
  this. It also proves nothing: if the new random key authenticates and it is
  not the default key, the keys have changed.
- **It never prints or stores the key.** `gp --lock` prints the new key on
  success (`locked with: …`); the script swallows that output so it cannot reach
  the terminal, scrollback, or a log file.
- **It refuses cards it cannot manage.** If the default key does not
  authenticate at step 2, the card has been personalised already (or is not
  ours). The script stops rather than retrying — see the bricking note above.

**Residual, accepted:** for the moment `gp --lock "$KEY"` is running, the key is
visible in the process list to a local user via `ps`. It is never written to
disk and never enters shell history. On a single-operator machine this is
acceptable; a shared build host would not be.

## The manufacturing log

`packages/javacard/personalization-log.tsv` — appended one line per card:

```
date                  serial    ictype  applet_commit  smoke  rotated
2026-09-06T04:25:27Z  07334320  D321    4c54946        pass   yes
```

Serial, date, applet commit, QA result. **Never a key.** It is gitignored: card
serials and shipment volumes do not belong in a public repository. When a
customer reports a problem, the serial tells you which applet build they have.

## Validating the line before you run it on stock

`personalize.sh` supports a loud, guarded test mode that uses a key **you**
supply and does **not** destroy it, so the card can be rotated back afterwards:

```bash
SEQRETS_PERSO_TEST_KEY=0102030405060708090A0B0C0D0E0F10 ./personalize.sh

# then restore the card:
java -jar lib/gp.jar --key 0102030405060708090A0B0C0D0E0F10 \
                     --lock 404142434445464748494A4B4C4D4E4F
```

It prints a red banner, and the manufacturing log records the card as
`TEST-DO-NOT-SHIP`. Never use it on customer stock — the entire security
property is that nobody knows the key.

**Run one real card end to end before batching.** A scripted mistake across
fifty cards is fifty bricks.

## Verified on hardware

2026-09-06, dev card `07334320` (JCOP, ICType `D321`, GP 2.3):

- Rotation round trip: default → test key → **authenticated with new key** →
  back to default → default authenticates again.
- Full `personalize.sh` run in test mode: install → 30/30 smoke test → rotate →
  verify → applet responds → log written.
- A card on rotated keys **rejects the default key** (`Card cryptogram
  invalid!`), confirmed independently on a second, already-personalised card.

The dev card was restored to default keys and remains reusable.
