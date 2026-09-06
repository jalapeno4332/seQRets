#!/usr/bin/env node
/**
 * Mint cross-version recovery fixtures for the seQRets Recover lifeboat.
 *
 * WHY THIS EXISTS
 * ---------------
 * The main app and Recover are pinned to different crypto libraries on purpose
 * — Recover is a frozen lifeboat and does not chase dependency bumps:
 *
 *     dependency          main app        Recover
 *     @noble/ciphers      ^2.2.0          0.4.0
 *     @noble/hashes       ^1.4.0 (1.8.0)  1.4.0
 *     @scure/bip39        ^1.3.0 (1.6.0)  1.3.0
 *
 * The F8 work (v1.12.0) proved the OLD→NEW direction: Qards made on ciphers
 * 0.4.0 still decrypt on 2.2.0. But the direction an heir actually depends on
 * is the REVERSE — a Qard made by TODAY's app must open in TODAY's Recover.
 * Nothing proved that. This script closes the gap: it mints real Qards with
 * the main app's current crypto, and Recover's test suite replays them with
 * its own pinned crypto.
 *
 * The fixtures are committed artifacts. Regenerate them deliberately — when
 * the share format changes, when the main app's crypto deps move, or at a
 * release — and review the diff.
 *
 * USAGE
 *     npm run build:crypto                      # fixtures come from dist/
 *     node scripts/generate-recover-fixtures.mjs
 *     node scripts/generate-recover-fixtures.mjs --out /path/to/qards.json
 *
 * Default output is the sibling Recover checkout:
 *     ../Recover/tests/fixtures/qards.json
 *
 * NOTE ON SECRETS: every password, secret and mnemonic below is a throwaway
 * test value committed to a public repo on purpose. The mnemonics are the
 * well-known all-zero-entropy BIP-39 vectors. Never put a real secret here.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createShares, encryptInstructions, appendShareHash } from '@seqrets/crypto';

// Primitives, used ONLY to hand-build the historical share shapes that the
// current createShares can no longer emit (pre-v1.9 hashless, v1.11.0
// hash-mid-string). Everything else goes through the real app code path.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { argon2id } from '@noble/hashes/argon2';
import { randomBytes } from '@noble/hashes/utils';
import { gzip } from 'pako';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SALT_LENGTH = 16;
const NONCE_LENGTH = 24;
const ARGON2 = { m: 65536, t: 4, p: 1, dkLen: 32 };

const b64 = (u8) => Buffer.from(u8).toString('base64');

// ── output path ──────────────────────────────────────────────────────
const outFlag = process.argv.indexOf('--out');
const outPath = outFlag !== -1 && process.argv[outFlag + 1]
  ? resolve(process.argv[outFlag + 1])
  : resolve(ROOT, '..', 'Recover', 'tests', 'fixtures', 'qards.json');

if (!existsSync(dirname(outPath))) {
  if (outFlag !== -1) {
    mkdirSync(dirname(outPath), { recursive: true });
  } else {
    console.error(
      `\n  Cannot find the Recover checkout at:\n    ${dirname(outPath)}\n\n`
      + `  Recover is expected as a sibling of this repo. Either clone it there:\n`
      + `    git clone git@github.com:seQRets/seQRets-Recover.git "${resolve(ROOT, '..', 'Recover')}"\n\n`
      + `  ...or pass an explicit destination:\n`
      + `    node scripts/generate-recover-fixtures.mjs --out <path/to/qards.json>\n`,
    );
    process.exit(1);
  }
}

// ── test values (throwaway, committed on purpose) ────────────────────
const MNEMONIC_12 = entropyToMnemonic(new Uint8Array(16), wordlist);
const MNEMONIC_24 = entropyToMnemonic(new Uint8Array(32), wordlist);
const KEYFILE_B64 = b64(Uint8Array.from({ length: 64 }, (_, i) => (i * 7 + 3) & 0xff));

const cases = [];
const started = Date.now();
let step = 0;
const log = (id) => {
  step += 1;
  process.stdout.write(`  [${String(step).padStart(2)}] ${id}\n`);
};

/** Mint a share-set fixture through the real createShares path. */
async function shareCase({ id, description, secret, password, label, total, required,
                           keyfile, embedRecoveryInfo = true, useShares, expect }) {
  log(id);
  const res = await createShares({
    secret, password, totalShares: total, requiredShares: required,
    label, keyfile, embedRecoveryInfo,
  });
  cases.push({
    id, description, kind: 'shares',
    password,
    keyfile: keyfile ?? null,
    shares: res.shares,
    // Which subset an heir feeds in. Deliberately not [0..k-1] everywhere —
    // Shamir must reconstruct from ANY k, not just the first k.
    useShares: useShares ?? [...Array(required).keys()],
    expect: expect ?? { secret: secret.trim(), label: label ?? '' },
  });
}

// ── 1. current-format positive cases ─────────────────────────────────

await shareCase({
  id: 'text-2of3-meta',
  description: 'Current format: text secret, 2-of-3, v=1 + t/n/i metadata, hash last. '
    + 'Restored from shares #1 and #3 to prove any-k reconstruction.',
  secret: 'correct horse battery staple — the canonical throwaway secret',
  password: 'fixture-password-2of3',
  label: 'Fixture · 2-of-3',
  total: 3, required: 2, useShares: [0, 2],
});

await shareCase({
  id: 'text-1of1',
  description: 'Single Qard: Shamir is skipped entirely, the share carries nonce+ciphertext directly.',
  secret: 'a lone qard with no shamir split',
  password: 'fixture-password-1of1',
  label: 'Fixture · 1-of-1',
  total: 1, required: 1,
});

await shareCase({
  id: 'text-2of2-no-meta',
  description: 'embedRecoveryInfo=false: v=1 is the only metadata segment, no t/n/i countdown.',
  secret: 'no recovery metadata on this one',
  password: 'fixture-password-nometa',
  label: 'Fixture · blind',
  total: 2, required: 2, embedRecoveryInfo: false,
});

await shareCase({
  id: 'mnemonic-12w',
  description: 'BIP-39 12-word (all-zero entropy vector). Exercises the isMnemonic '
    + 'entropy-compaction path and Recover\'s phrase reassembly.',
  secret: MNEMONIC_12,
  password: 'fixture-password-12w',
  label: 'Fixture · 12 words',
  total: 2, required: 2,
  expect: { secret: MNEMONIC_12, label: 'Fixture · 12 words' },
});

await shareCase({
  id: 'mnemonic-24w',
  description: 'BIP-39 24-word (all-zero entropy vector).',
  secret: MNEMONIC_24,
  password: 'fixture-password-24w',
  label: 'Fixture · 24 words',
  total: 3, required: 2, useShares: [1, 2],
  expect: { secret: MNEMONIC_24, label: 'Fixture · 24 words' },
});

await shareCase({
  id: 'mnemonic-multi-12-24',
  description: 'Two phrases in one secret → mnemonicLengths [12,24]. Recover must split the '
    + 'concatenated entropy back at the right byte offsets and rejoin with a blank line.',
  secret: `${MNEMONIC_12}\n\n${MNEMONIC_24}`,
  password: 'fixture-password-multi',
  label: 'Fixture · two phrases',
  total: 2, required: 2,
  expect: { secret: `${MNEMONIC_12}\n\n${MNEMONIC_24}`, label: 'Fixture · two phrases' },
});

await shareCase({
  id: 'keyfile-2of3',
  description: 'Keyfile as second factor: the key is Argon2id(password ‖ keyfile). '
    + 'Recover must concatenate in the same order.',
  secret: 'this secret needs the keyfile too',
  password: 'fixture-password-keyfile',
  label: 'Fixture · keyfile',
  total: 3, required: 2, keyfile: KEYFILE_B64, useShares: [0, 1],
});

await shareCase({
  id: 'unicode-label-and-secret',
  description: 'Non-ASCII in both secret and label — guards the TextEncoder/TextDecoder '
    + 'round trip across the two library versions.',
  secret: 'مفتاح · ключ · 鍵 · κλειδί · 🔑 emoji and “smart quotes” — em–dashes',
  password: 'fixture-pässwörd-ünïcode-🔐',
  label: 'Fixture · ünïcode 🗝️',
  total: 2, required: 2,
});

await shareCase({
  id: 'large-secret-multibucket',
  description: 'Payload spanning many 192-byte padding buckets, so the v=1 zero padding is '
    + 'non-trivial. Recover has no unpad step — pako must stop at the gzip stream end.',
  secret: Array.from({ length: 220 }, (_, i) => `line ${i}: ${'x'.repeat(40)}`).join('\n'),
  password: 'fixture-password-large',
  label: 'Fixture · large',
  total: 3, required: 3,
});

// ── 2. historical shapes (hand-built — createShares can't emit these) ─

/**
 * Build a share the way the app did BEFORE a given format change. Uses the
 * same primitives and the same Argon2id parameters, but assembles the wire
 * string by hand and skips the v=1 zero padding (which did not exist yet).
 */
async function legacyBlob(secret, password, label) {
  const payload = JSON.stringify({ secret, label, isMnemonic: false });
  const compressed = gzip(new TextEncoder().encode(payload), { level: 9, windowBits: 15, memLevel: 9 });
  const salt = randomBytes(SALT_LENGTH);
  const key = await argon2id(new TextEncoder().encode(password), salt, ARGON2);
  const nonce = randomBytes(NONCE_LENGTH);
  const ct = xchacha20poly1305(key, nonce).encrypt(compressed);
  const combined = new Uint8Array(nonce.length + ct.length);
  combined.set(nonce, 0);
  combined.set(ct, nonce.length);
  key.fill(0);
  return { salt: b64(salt), data: b64(combined) };
}

{
  const id = 'legacy-pre-v19-3seg';
  log(id);
  const secret = 'a qard printed before the hash segment existed';
  const password = 'fixture-password-legacy3';
  const { salt, data } = await legacyBlob(secret, password, 'Fixture · legacy');
  cases.push({
    id,
    description: 'Pre-v1.9 shape: seQRets|salt|data — no hash, no metadata, no padding. '
      + 'Steel plates stamped years ago still look like this; they must never stop working.',
    kind: 'shares', password, keyfile: null,
    shares: [`seQRets|${salt}|${data}`],
    useShares: [0],
    expect: { secret, label: 'Fixture · legacy' },
  });
}

{
  const id = 'legacy-v1110-hash-mid';
  log(id);
  const secret = 'a qard from the brief window when the hash sat mid-string';
  const password = 'fixture-password-legacymid';
  const { salt, data } = await legacyBlob(secret, password, 'Fixture · hash-mid');
  // v1.11.0 layout: ...|sha256:H|t=|n=|i= — hash BEFORE the metadata, but the
  // hash still covers the metadata, so the input is the same as hash-last.
  const core = `seQRets|${salt}|${data}|t=1|n=1|i=1`;
  const hash = appendShareHash(core).split('|sha256:')[1];
  cases.push({
    id,
    description: 'v1.11.0 shape: hash sits BETWEEN data and metadata. Recover locates the '
      + 'sha256 segment by content, not position, so this must still verify.',
    kind: 'shares', password, keyfile: null,
    shares: [`seQRets|${salt}|${data}|sha256:${hash}|t=1|n=1|i=1`],
    useShares: [0],
    expect: { secret, label: 'Fixture · hash-mid' },
  });
}

// ── 3. encrypted inheritance plan ────────────────────────────────────

{
  const id = 'plan-file-envelope';
  log(id);
  const password = 'fixture-password-plan';
  const fileText = 'Where the Qards are\n===================\n\nQard 1 — sister\nQard 2 — safe deposit box\nQard 3 — attorney\n';
  const raw = {
    fileName: 'inheritance-plan.txt',
    fileContent: Buffer.from(fileText, 'utf8').toString('base64'),
    fileType: 'text/plain',
  };
  const enc = await encryptInstructions(raw, password);
  cases.push({
    id,
    description: 'Encrypted inheritance plan: { salt, data } with no Shamir step. Recover must '
      + 'decrypt it and unwrap the fileName/fileContent/fileType envelope.',
    kind: 'plan', password, keyfile: null,
    plan: enc,
    expect: { fileName: raw.fileName, fileType: raw.fileType, fileText },
  });
}

// ── 4. negative cases — these MUST fail, and fail legibly ────────────

{
  const id = 'negative-tampered-data';
  log(id);
  const password = 'fixture-password-tamper';
  const res = await createShares({
    secret: 'this share will be corrupted on purpose', password,
    totalShares: 2, requiredShares: 2, label: 'Fixture · tampered', embedRecoveryInfo: true,
  });
  // Flip one base64 character in the DATA segment, leaving the hash intact.
  const parts = res.shares[0].split('|');
  const d = parts[2];
  const at = Math.floor(d.length / 2);
  parts[2] = d.slice(0, at) + (d[at] === 'A' ? 'B' : 'A') + d.slice(at + 1);
  cases.push({
    id,
    description: 'One base64 character flipped in the data segment. The SHA-256 must catch it '
      + 'BEFORE any decryption is attempted.',
    kind: 'shares', password, keyfile: null,
    shares: [parts.join('|'), res.shares[1]],
    useShares: [0, 1],
    expectError: 'integrity check',
  });
}

{
  const id = 'negative-future-version';
  log(id);
  const password = 'fixture-password-future';
  const res = await createShares({
    secret: 'pretend this came from a newer seQRets', password,
    totalShares: 1, requiredShares: 1, label: 'Fixture · future', embedRecoveryInfo: false,
  });
  // Re-stamp as v=2 and re-hash so the share is INTACT but from the future.
  // This is the whole point of the v= segment: "outdated software" must never
  // be reported to an heir as "damaged backup".
  const parts = res.shares[0].split('|');
  const core = `seQRets|${parts[1]}|${parts[2]}|v=2`;
  cases.push({
    id,
    description: 'A structurally perfect share stamped v=2. Recover must refuse it with an '
      + '"update your recovery tool" message — never a checksum or corruption error.',
    kind: 'shares', password, keyfile: null,
    shares: [appendShareHash(core)],
    useShares: [0],
    expectError: 'newer version',
  });
}

{
  const id = 'negative-wrong-password';
  log(id);
  const password = 'fixture-password-correct';
  const res = await createShares({
    secret: 'you will not see this', password,
    totalShares: 2, requiredShares: 2, label: 'Fixture · wrong pw', embedRecoveryInfo: true,
  });
  cases.push({
    id,
    description: 'Correct, undamaged shares with the wrong password. Must fail closed at the '
      + 'AEAD tag with a password-shaped message, not a corruption message.',
    kind: 'shares', password: 'fixture-password-WRONG', keyfile: null,
    shares: res.shares, useShares: [0, 1],
    expectError: 'could not decrypt',
  });
}

{
  const id = 'negative-mixed-sets';
  log(id);
  const password = 'fixture-password-mixed';
  const a = await createShares({
    secret: 'set A', password, totalShares: 2, requiredShares: 2,
    label: 'Fixture · set A', embedRecoveryInfo: true,
  });
  const b = await createShares({
    secret: 'set B', password, totalShares: 2, requiredShares: 2,
    label: 'Fixture · set B', embedRecoveryInfo: true,
  });
  cases.push({
    id,
    description: 'One Qard from each of two different secrets. Salts differ, so Recover must '
      + 'say so plainly instead of grinding through Argon2id and failing at the tag.',
    kind: 'shares', password, keyfile: null,
    shares: [a.shares[0], b.shares[0]], useShares: [0, 1],
    expectError: 'different secrets',
  });
}

{
  const id = 'negative-missing-keyfile';
  log(id);
  const password = 'fixture-password-needskeyfile';
  const res = await createShares({
    secret: 'protected by a keyfile', password,
    totalShares: 2, requiredShares: 2, label: 'Fixture · keyfile missing',
    keyfile: KEYFILE_B64, embedRecoveryInfo: true,
  });
  cases.push({
    id,
    description: 'Keyfile-protected shares recovered WITHOUT the keyfile. Must fail at the AEAD '
      + 'tag — proof the keyfile really is part of the key, not decoration.',
    kind: 'shares', password, keyfile: null,
    shares: res.shares, useShares: [0, 1],
    expectError: 'could not decrypt',
  });
}

// ── write ────────────────────────────────────────────────────────────

// Read straight off disk: several of these packages don't expose
// './package.json' through their exports map.
const depVersion = (name) =>
  JSON.parse(readFileSync(resolve(ROOT, 'node_modules', name, 'package.json'), 'utf8')).version;
const appVersion = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

const fixture = {
  $comment: 'GENERATED FILE — do not hand-edit. See seQRets-app/scripts/generate-recover-fixtures.mjs. '
    + 'Every password and secret here is a throwaway test value committed on purpose.',
  generatedAt: new Date().toISOString().slice(0, 10),
  generatedBy: {
    app: 'seQRets-app',
    version: appVersion.version,
    codename: appVersion.codename,
    shareFormatVersion: 1,
    // The whole point: these are the versions that CREATED the Qards. Recover
    // replays them with its own, older pins.
    deps: {
      '@noble/ciphers': depVersion('@noble/ciphers'),
      '@noble/hashes': depVersion('@noble/hashes'),
      '@scure/bip39': depVersion('@scure/bip39'),
      'pako': depVersion('pako'),
      'shamir-secret-sharing': depVersion('shamir-secret-sharing'),
    },
  },
  cases,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `\n  ${cases.length} fixtures (${cases.filter(c => c.expectError).length} negative) `
  + `minted in ${secs}s with @noble/ciphers ${fixture.generatedBy.deps['@noble/ciphers']}\n`
  + `  → ${outPath}\n\n`
  + `  Now run Recover's suite against them:\n`
  + `    cd ${relative(ROOT, resolve(ROOT, '..', 'Recover')) || '../Recover'} && npm test\n`,
);
