// seQRets — crypto core test suite.
//
// Runs against the BUILT @seqrets/crypto package (dist/), not the TypeScript
// source, so what is tested is what actually ships to both apps.
//
//     npm test
//
// Uses Node's built-in test runner and assert module. No framework, no new
// dependencies — the same reasoning as the Recover lifeboat: a test suite that
// needs a toolchain is a test suite that stops running.
//
// Argon2id at m=64MiB/t=4 costs ~2s per derivation, which is the whole point of
// it. Share sets are therefore created ONCE in a `before` hook and reused across
// assertions; only tests that genuinely need a fresh derivation pay for one.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  createShares,
  restoreSecret,
  parseShare,
  computeShareHash,
  appendShareHash,
  truncateHash,
  padPayload,
  masterFingerprint,
  encryptVault,
  decryptVault,
  encryptInstructions,
  decryptInstructions,
  SHARE_FORMAT_VERSION,
  PAYLOAD_PAD_BUCKET,
} from '@seqrets/crypto';

const PASSWORD = 'a throwaway test password, not a real one';
const KEYFILE = Buffer.from(Uint8Array.from({ length: 64 }, (_, i) => (i * 11 + 5) & 0xff)).toString('base64');

// Shared 2-of-3 set — the workhorse for most assertions below.
let set;
const SECRET = 'correct horse battery staple';
const LABEL = 'Test · 2-of-3';

before(async () => {
  set = await createShares({
    secret: SECRET, password: PASSWORD,
    totalShares: 3, requiredShares: 2,
    label: LABEL, embedRecoveryInfo: true,
  });
});

// ── share format: parsing, hashing, metadata ─────────────────────────
// These cost no Argon2id, so they can be exhaustive.

describe('share format', () => {
  it('serializes as seQRets|salt|data|v=N|t|n|i|sha256 with the hash last', () => {
    const parts = set.shares[0].split('|');
    assert.equal(parts[0], 'seQRets');
    assert.equal(parts[3], `v=${SHARE_FORMAT_VERSION}`, 'v= must be the FIRST metadata segment');
    assert.ok(parts[parts.length - 1].startsWith('sha256:'), 'hash must sit at the END');
  });

  it('hashes everything before |sha256:, so `shasum` verification works by hand', () => {
    // This is the documented manual-verification recipe. If it ever stops
    // holding, the docs silently become wrong.
    for (const share of set.shares) {
      const cut = share.lastIndexOf('|sha256:');
      const core = share.slice(0, cut);
      const embedded = share.slice(cut + '|sha256:'.length);
      assert.equal(computeShareHash(core), embedded);
    }
  });

  it('validates the hash of every generated share', () => {
    for (const share of set.shares) {
      assert.equal(parseShare(share).hashValid, true);
    }
  });

  it('reports hashValid=false for a tampered payload', () => {
    const parts = set.shares[0].split('|');
    const d = parts[2];
    const at = Math.floor(d.length / 2);
    parts[2] = d.slice(0, at) + (d[at] === 'A' ? 'B' : 'A') + d.slice(at + 1);
    assert.equal(parseShare(parts.join('|')).hashValid, false);
  });

  it('locates the hash by content, so the v1.11.0 hash-in-the-middle layout still verifies', () => {
    // Some v1.11.0 test Qards put sha256: between data and metadata. Both
    // layouts must hash to the same value.
    const { salt, data } = parseShare(set.shares[0]);
    const core = `seQRets|${salt}|${data}|t=2|n=3|i=1`;
    const hash = computeShareHash(core);
    const hashMid = `seQRets|${salt}|${data}|sha256:${hash}|t=2|n=3|i=1`;
    const parsed = parseShare(hashMid);
    assert.equal(parsed.hashValid, true);
    assert.equal(parsed.threshold, 2);
    assert.equal(parsed.index, 1);
  });

  it('treats a legacy 3-segment share as unhashed (null), never as damaged (false)', () => {
    const { salt, data } = parseShare(set.shares[0]);
    const parsed = parseShare(`seQRets|${salt}|${data}`);
    assert.equal(parsed.hashValid, null, 'null means "predates hashing"; false would mean "corrupt"');
    assert.equal(parsed.threshold, null);
  });

  it('ignores unknown metadata keys but still covers them with the hash', () => {
    // Forward compatibility: a future version may add segments this build has
    // never heard of. They must not be rejected.
    const { salt, data } = parseShare(set.shares[0]);
    const share = appendShareHash(`seQRets|${salt}|${data}|v=1|zz=99|t=2|n=3|i=1`);
    const parsed = parseShare(share);
    assert.equal(parsed.hashValid, true);
    assert.equal(parsed.threshold, 2);
  });

  it('rejects a share from a FUTURE format version with an update message', () => {
    // The entire reason the v= segment exists: an executor decades from now
    // must be able to tell "outdated software" from "damaged backup".
    const { salt, data } = parseShare(set.shares[0]);
    const future = appendShareHash(`seQRets|${salt}|${data}|v=${SHARE_FORMAT_VERSION + 1}`);
    assert.throws(() => parseShare(future), /newer version/i);
  });

  it('accepts the current format version', () => {
    const { salt, data } = parseShare(set.shares[0]);
    const ok = appendShareHash(`seQRets|${salt}|${data}|v=${SHARE_FORMAT_VERSION}`);
    assert.equal(parseShare(ok).version, SHARE_FORMAT_VERSION);
  });

  it('rejects input that is not a seQRets share', () => {
    assert.throws(() => parseShare('not|a|share'), /invalid or corrupted/i);
    assert.throws(() => parseShare('seQRets|only-two'), /invalid or corrupted/i);
  });
});

// ── recovery metadata (t/n/i) validation ─────────────────────────────

describe('recovery metadata', () => {
  const meta = (segs) => {
    const { salt, data } = parseShare(set.shares[0]);
    return parseShare(appendShareHash(`seQRets|${salt}|${data}|v=1|${segs}`));
  };

  it('accepts a well-formed trio', () => {
    const p = meta('t=2|n=3|i=1');
    assert.deepEqual([p.threshold, p.total, p.index], [2, 3, 1]);
  });

  it('accepts a single-Qard set (t=1|n=1|i=1)', () => {
    const p = meta('t=1|n=1|i=1');
    assert.deepEqual([p.threshold, p.total, p.index], [1, 1, 1]);
  });

  it('drops the whole trio when it is contradictory (t > n)', () => {
    // Restore must still work; only the "X of K added" countdown is lost.
    const p = meta('t=5|n=3|i=1');
    assert.deepEqual([p.threshold, p.total, p.index], [null, null, null]);
  });

  it('drops the whole trio when it is contradictory (i > n)', () => {
    const p = meta('t=2|n=3|i=9');
    assert.deepEqual([p.threshold, p.total, p.index], [null, null, null]);
  });

  it('drops the whole trio when it is partial', () => {
    const p = meta('t=2');
    assert.deepEqual([p.threshold, p.total, p.index], [null, null, null]);
  });

  it('ignores out-of-range and malformed values', () => {
    for (const bad of ['t=0|n=3|i=1', 't=999|n=3|i=1', 't=-3|n=3|i=1', 't=2junk|n=3|i=1']) {
      const p = meta(bad);
      assert.equal(p.threshold, null, `expected t to be ignored for "${bad}"`);
    }
  });
});

// ── size ceiling ─────────────────────────────────────────────────────

describe('MAX_SHARE_LENGTH', () => {
  // NEVER lower this. Secrets too large for a QR become text-file backups,
  // which can legitimately be large; a lower ceiling strands real Qards.
  it('rejects input larger than 256 KB', () => {
    const huge = `seQRets|c2FsdA==|${'A'.repeat(262_200)}`;
    assert.throws(() => parseShare(huge), /too large/i);
  });

  it('does NOT reject a large-but-legal share on length grounds', () => {
    const big = `seQRets|c2FsdA==|${'A'.repeat(200_000)}`;
    // It may fail its hash (there isn't one) but must not throw "too large".
    assert.doesNotThrow(() => parseShare(big));
  });
});

// ── length-privacy padding ───────────────────────────────────────────

describe('payload padding (length privacy)', () => {
  it('pads up to a bucket multiple, with a minimum of one bucket', () => {
    assert.equal(padPayload(new Uint8Array(1)).length, PAYLOAD_PAD_BUCKET);
    assert.equal(padPayload(new Uint8Array(PAYLOAD_PAD_BUCKET)).length, PAYLOAD_PAD_BUCKET);
    assert.equal(padPayload(new Uint8Array(PAYLOAD_PAD_BUCKET + 1)).length, PAYLOAD_PAD_BUCKET * 2);
  });

  it('pads with ZERO bytes only, and preserves the original prefix', () => {
    // Non-zero padding would break restores: pako tolerates only trailing
    // zeros after a gzip stream. This is what keeps padded Qards readable by
    // older apps and already-deployed recover.html copies.
    const input = Uint8Array.from({ length: 10 }, (_, i) => i + 1);
    const padded = padPayload(input);
    assert.deepEqual([...padded.slice(0, 10)], [...input]);
    assert.ok([...padded.slice(10)].every(b => b === 0), 'padding bytes must all be 0x00');
  });

  it('hides the size difference between two secrets in the same bucket', async () => {
    // The observable property that padding is meant to deliver.
    const mk = (secret) => createShares({
      secret, password: PASSWORD, totalShares: 1, requiredShares: 1,
      label: '', embedRecoveryInfo: false,
    });
    const [a, b] = await Promise.all([mk('short'), mk('a considerably longer secret than the other one')]);
    const len = (r) => parseShare(r.shares[0]).data.length;
    assert.equal(len(a), len(b), 'two same-bucket secrets must produce equal-length payloads');
  });
});

// ── round trips ──────────────────────────────────────────────────────

describe('round trip', () => {
  it('restores from a NON-leading subset of shares', async () => {
    // Uses shares 1 and 3 — proves real Shamir reconstruction rather than
    // an accident of array ordering.
    const out = await restoreSecret({
      shares: [set.shares[0], set.shares[2]],
      password: PASSWORD,
    });
    assert.equal(out.secret, SECRET);
    assert.equal(out.label, LABEL);
  });

  it('fails closed on the wrong password', async () => {
    await assert.rejects(
      restoreSecret({ shares: [set.shares[0], set.shares[1]], password: 'not the password' }),
    );
  });

  it('round-trips a single Qard with no Shamir split', async () => {
    const one = await createShares({
      secret: 'a lone qard', password: PASSWORD,
      totalShares: 1, requiredShares: 1, label: 'solo', embedRecoveryInfo: false,
    });
    assert.equal(one.shares.length, 1);
    const out = await restoreSecret({ shares: one.shares, password: PASSWORD });
    assert.equal(out.secret, 'a lone qard');
  });

  it('round-trips a BIP-39 mnemonic through entropy compaction', async () => {
    // 24 words (~150 chars) are stored as 32 bytes and rebuilt on restore.
    const mnemonic = 'abandon '.repeat(23) + 'art';
    const m = await createShares({
      secret: mnemonic, password: PASSWORD,
      totalShares: 2, requiredShares: 2, label: 'seed', embedRecoveryInfo: true,
    });
    const out = await restoreSecret({ shares: m.shares, password: PASSWORD });
    assert.equal(out.secret, mnemonic);
  });

  it('omits t/n/i when embedRecoveryInfo is false', async () => {
    const blind = await createShares({
      secret: 'no countdown', password: PASSWORD,
      totalShares: 2, requiredShares: 2, label: 'blind', embedRecoveryInfo: false,
    });
    const p = parseShare(blind.shares[0]);
    assert.deepEqual([p.threshold, p.total, p.index], [null, null, null]);
    assert.equal(p.version, SHARE_FORMAT_VERSION, 'v= must still be present');
  });
});

// ── keyfile as second factor ─────────────────────────────────────────

describe('keyfile', () => {
  let withKeyfile;

  before(async () => {
    withKeyfile = await createShares({
      secret: 'guarded by a keyfile', password: PASSWORD,
      totalShares: 2, requiredShares: 2, label: 'kf', embedRecoveryInfo: true,
      keyfile: KEYFILE,
    });
  });

  it('restores with the correct keyfile', async () => {
    const out = await restoreSecret({ shares: withKeyfile.shares, password: PASSWORD, keyfile: KEYFILE });
    assert.equal(out.secret, 'guarded by a keyfile');
  });

  it('fails without the keyfile — proof it is part of the key', async () => {
    await assert.rejects(restoreSecret({ shares: withKeyfile.shares, password: PASSWORD }));
  });
});

// ── creation guards ──────────────────────────────────────────────────

describe('creation guards', () => {
  it('rejects a 1-share set that claims to require more than 1', async () => {
    await assert.rejects(createShares({
      secret: 'x', password: PASSWORD, totalShares: 1, requiredShares: 2,
    }), /required shares must also be 1/i);
  });

  it('rejects a multi-share set where any single Qard would suffice', async () => {
    // requiredShares=1 with totalShares>1 would let one Qard restore alone,
    // silently destroying the whole point of splitting.
    await assert.rejects(createShares({
      secret: 'x', password: PASSWORD, totalShares: 3, requiredShares: 1,
    }), /at least 2/i);
  });
});

// ── vault + inheritance plan blobs ───────────────────────────────────

describe('vault and plan blobs', () => {
  it('round-trips a vault', async () => {
    const json = JSON.stringify({ hello: 'world', n: 42 });
    const { salt, data } = await encryptVault(json, PASSWORD);
    assert.equal(await decryptVault(salt, data, PASSWORD), json);
  });

  it('round-trips an encrypted inheritance plan', async () => {
    const raw = {
      fileName: 'plan.txt',
      fileContent: Buffer.from('where the qards are').toString('base64'),
      fileType: 'text/plain',
    };
    const enc = await encryptInstructions(raw, PASSWORD);
    const out = await decryptInstructions({
      encryptedData: JSON.stringify(enc),
      password: PASSWORD,
    });
    assert.equal(out.fileName, 'plan.txt');
    assert.equal(Buffer.from(out.fileContent, 'base64').toString(), 'where the qards are');
  });
});

// ── BIP-32 master fingerprint ────────────────────────────────────────

describe('masterFingerprint', () => {
  // The all-zero-entropy 12-word vector. Its XFP is a fixed, publicly known
  // value, so this also pins that we derive at m/ with an empty passphrase.
  const VECTOR_12 = `${'abandon '.repeat(11)}about`;

  it('derives the known XFP for the all-zero 12-word vector', () => {
    assert.equal(masterFingerprint(VECTOR_12), '73C5DA0A');
  });

  it('stays correct across repeated calls', () => {
    // Guards the zeroization added alongside this test: the function wipes the
    // HDKey's private material in a finally block, and must not wipe its way
    // into returning a wrong (or null) answer the second time round.
    assert.equal(masterFingerprint(VECTOR_12), masterFingerprint(VECTOR_12));
  });

  it('returns null for a non-mnemonic instead of throwing', () => {
    assert.equal(masterFingerprint('not a seed phrase at all'), null);
    assert.equal(masterFingerprint(''), null);
  });

  it('ignores surrounding whitespace and repeated spaces', () => {
    assert.equal(masterFingerprint(`  ${VECTOR_12.replace(/ /g, '   ')}  `), '73C5DA0A');
  });
});

// ── hash display helper ──────────────────────────────────────────────

describe('truncateHash', () => {
  it('shows the first and last 8 hex characters', () => {
    const h = 'a'.repeat(8) + 'b'.repeat(48) + 'c'.repeat(8);
    assert.equal(truncateHash(h), `${'a'.repeat(8)}...${'c'.repeat(8)}`);
  });
});
