// In-browser election engine that mirrors the CS4783 Project 2 design:
//  - one-hot votes encoded in base (maxVoters + 1), so counts never carry into the next candidate
//  - a regular ballot and a reverse ballot per voter
//  - an HMAC keyed by the voter token (the original used a SHA-256 checksum bound to the token)
//  - ballots are multiplied together; only the combined total is ever decrypted

import { addCipher, decrypt, encrypt, generateKeys, hmacHex, randomBits, sha256Hex } from './paillier';
import type { PrivateKey, PublicKey } from './paillier';

const ZERO = BigInt(0);
const ONE = BigInt(1);

export interface ElectionConfig {
  name: string;
  candidates: string[];
  maxVoters: number;
  keyBits: number;
}

export interface Ballot {
  tokenTag: string; // SHA-256 of the token; the token itself is never sent
  cipher: bigint; // Enc(radix^candidate)
  reverse: bigint; // Enc(radix^(k-1-candidate))
  mac: string;
  digest: string; // SHA-256 of the ciphertext, shown on receipts
}

export type SubmitOutcome = { ok: true; seq: number } | { ok: false; reason: string };

export type AuditKind = 'accepted' | 'rejected' | 'info';

export interface AuditEntry {
  id: number;
  time: string;
  kind: AuditKind;
  message: string;
}

export interface TallyCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface TallyResult {
  accepted: number;
  counts: number[];
  reverseCounts: number[];
  checks: TallyCheck[];
  trusted: boolean;
}

export type AttackKind = 'fake-token' | 'double-vote' | 'tamper' | 'multi-vote' | 'unknown-candidate';

export interface AttackReport {
  kind: AttackKind;
  title: string;
  counted: boolean; // true = the ballot got past the per-ballot checks
  detail: string;
}

export function normalizeToken(input: string): string {
  return input.replace(/\D/g, '');
}

export function formatToken(digits: string): string {
  return (digits.match(/.{1,6}/g) ?? []).join('-');
}

export function shortHex(value: bigint | string, head = 20, tail = 8): string {
  const hex = typeof value === 'bigint' ? value.toString(16) : value;
  return hex.length <= head + tail + 1 ? hex : `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function makeToken(): string {
  return randomBits(128).toString(10).padStart(39, '0');
}

function bigPow(base: bigint, exp: number): bigint {
  let result = ONE;
  for (let i = 0; i < exp; i++) result = result * base;
  return result;
}

function payload(cipher: bigint, reverse: bigint): string {
  return `${cipher.toString(16)}|${reverse.toString(16)}`;
}

export class ElectionStore {
  config: ElectionConfig | null = null;
  pub: PublicKey | null = null;
  keyFingerprint = '';
  tokens: string[] = [];
  used = new Set<string>();
  ballots: Ballot[] = [];
  audit: AuditEntry[] = [];
  rejectedCount = 0;

  private priv: PrivateKey | null = null;
  private tokenByTag = new Map<string, string>();
  private nextAuditId = 1;

  reset(): void {
    this.config = null;
    this.pub = null;
    this.priv = null;
    this.keyFingerprint = '';
    this.tokens = [];
    this.used = new Set();
    this.ballots = [];
    this.audit = [];
    this.rejectedCount = 0;
    this.tokenByTag = new Map();
    this.nextAuditId = 1;
  }

  private log(kind: AuditKind, message: string): void {
    this.audit.push({ id: this.nextAuditId++, time: new Date().toLocaleTimeString(), kind, message });
  }

  private need(): { config: ElectionConfig; pub: PublicKey; priv: PrivateKey } {
    if (!this.config || !this.pub || !this.priv) throw new Error('Create an election first.');
    return { config: this.config, pub: this.pub, priv: this.priv };
  }

  private get radix(): bigint {
    return BigInt(this.need().config.maxVoters + 1);
  }

  async setup(config: ElectionConfig, onProgress?: (message: string) => void): Promise<void> {
    this.reset();
    const keys = await generateKeys(config.keyBits, onProgress);
    const tokens: string[] = [];
    while (tokens.length < config.maxVoters) {
      const t = makeToken();
      if (!tokens.includes(t)) tokens.push(t);
    }
    for (const t of tokens) this.tokenByTag.set(await sha256Hex(t), t);
    this.config = config;
    this.pub = keys.pub;
    this.priv = keys.priv;
    this.tokens = tokens;
    this.keyFingerprint = (await sha256Hex(keys.pub.n.toString(16))).slice(0, 16);
    this.log('info', `Election "${config.name}" created: ${config.candidates.length} candidates, ${config.maxVoters} tokens, ${config.keyBits}-bit key.`);
  }

  nextUnusedToken(): string | undefined {
    return this.tokens.find((t) => !this.used.has(t));
  }

  // ---- voter side -------------------------------------------------------

  async buildBallot(tokenInput: string, plain: bigint, plainReverse: bigint): Promise<Ballot> {
    const { pub } = this.need();
    const token = normalizeToken(tokenInput);
    const cipher = encrypt(pub, plain);
    const reverse = encrypt(pub, plainReverse);
    return {
      tokenTag: await sha256Hex(token),
      cipher,
      reverse,
      mac: await hmacHex(token, payload(cipher, reverse)),
      digest: await sha256Hex(cipher.toString(16)),
    };
  }

  async castVote(tokenInput: string, candidate: number): Promise<{ ballot: Ballot; result: SubmitOutcome }> {
    const { config } = this.need();
    const k = config.candidates.length;
    const ballot = await this.buildBallot(
      tokenInput,
      bigPow(this.radix, candidate),
      bigPow(this.radix, k - 1 - candidate),
    );
    return { ballot, result: await this.submit(ballot) };
  }

  // ---- administrator side ----------------------------------------------

  async submit(ballot: Ballot): Promise<SubmitOutcome> {
    const who = ballot.tokenTag.slice(0, 8);
    const reject = (reason: string): SubmitOutcome => {
      this.rejectedCount++;
      this.log('rejected', `Voter ${who}: ${reason}`);
      return { ok: false, reason };
    };
    const token = this.tokenByTag.get(ballot.tokenTag);
    if (!token) return reject('Unknown voter token. Ballot not counted.');
    const expected = await hmacHex(token, payload(ballot.cipher, ballot.reverse));
    if (expected !== ballot.mac) {
      return reject('Message authentication code does not match. The ballot was modified, so it was not counted.');
    }
    if (this.used.has(token)) return reject('This token has already voted. Only the first ballot is counted.');
    this.used.add(token);
    this.ballots.push(ballot);
    const seq = this.ballots.length;
    this.log('accepted', `Voter ${who}: ballot #${seq} accepted and stored encrypted.`);
    return { ok: true, seq };
  }

  aggregateCipher(): bigint {
    const { pub } = this.need();
    let acc = ONE;
    for (const b of this.ballots) acc = addCipher(pub, acc, b.cipher);
    return acc;
  }

  private decode(m: bigint, k: number): { counts: number[]; leftover: bigint } {
    const radix = this.radix;
    const counts: number[] = [];
    let rest = m;
    for (let i = 0; i < k; i++) {
      counts.push(Number(rest % radix));
      rest = rest / radix;
    }
    return { counts, leftover: rest };
  }

  runTally(): TallyResult {
    const { config, pub, priv } = this.need();
    const k = config.candidates.length;
    let acc = ONE;
    let accReverse = ONE;
    for (const b of this.ballots) {
      acc = addCipher(pub, acc, b.cipher);
      accReverse = addCipher(pub, accReverse, b.reverse);
    }
    // Only the two combined totals are decrypted. No individual ballot is.
    const main = this.decode(decrypt(pub, priv, acc), k);
    const rev = this.decode(decrypt(pub, priv, accReverse), k);
    const accepted = this.ballots.length;
    const total = main.counts.reduce((a, b) => a + b, 0);
    const reversedBack = rev.counts.slice().reverse();
    const mirrorOk = reversedBack.every((v, i) => v === main.counts[i]) && rev.leftover === ZERO;

    const checks: TallyCheck[] = [
      {
        label: 'Votes counted equal ballots received',
        ok: total === accepted,
        detail: `${total} votes counted from ${accepted} ballots.`,
      },
      {
        label: 'Reverse ballots mirror the regular tally',
        ok: mirrorOk,
        detail: mirrorOk
          ? 'Reversing the reverse tally gives the same counts.'
          : `Regular ${main.counts.join(', ')} vs reversed ${reversedBack.join(', ')}.`,
      },
      {
        label: 'No votes for unknown candidates',
        ok: main.leftover === ZERO,
        detail: main.leftover === ZERO ? 'Every vote falls on a listed candidate.' : 'The total holds votes outside the candidate list.',
      },
    ];
    const trusted = checks.every((c) => c.ok);
    this.log(
      trusted ? 'info' : 'rejected',
      trusted
        ? `Tally decrypted from ${accepted} ballots. Only the combined totals were decrypted. All integrity checks passed.`
        : `Tally decrypted from ${accepted} ballots. An integrity check failed, so the result cannot be trusted.`,
    );
    return { accepted, counts: main.counts, reverseCounts: rev.counts, checks, trusted };
  }

  // ---- homomorphism demo ------------------------------------------------

  demoAddition(a: number, b: number): { ca: bigint; cb: bigint; product: bigint; sum: bigint } {
    const { pub, priv } = this.need();
    const ca = encrypt(pub, BigInt(a));
    const cb = encrypt(pub, BigInt(b));
    const product = addCipher(pub, ca, cb);
    return { ca, cb, product, sum: decrypt(pub, priv, product) };
  }

  // ---- attack lab -------------------------------------------------------

  async runAttack(kind: AttackKind): Promise<AttackReport> {
    const { config, pub } = this.need();
    const k = config.candidates.length;
    const radix = this.radix;
    const fail = (title: string, detail: string): AttackReport => ({ kind, title, counted: false, detail });

    if (kind === 'fake-token') {
      const ballot = await this.buildBallot(makeToken(), bigPow(radix, 0), bigPow(radix, k - 1));
      const r = await this.submit(ballot);
      return fail('Forged voter token', r.ok ? 'Unexpectedly accepted.' : r.reason);
    }

    if (kind === 'double-vote') {
      let token = this.tokens.find((t) => this.used.has(t));
      if (!token) {
        const fresh = this.nextUnusedToken();
        if (!fresh) return fail('Vote twice', 'No tokens left to demonstrate with. Create a new election.');
        await this.castVote(fresh, 0);
        token = fresh;
      }
      const second = await this.castVote(token, k - 1);
      return fail('Vote twice with one token', second.result.ok ? 'Unexpectedly accepted.' : second.result.reason);
    }

    const token = this.nextUnusedToken();
    if (!token) return fail('Attack', 'All tokens are used. Create a new election to try this attack.');

    if (kind === 'tamper') {
      const ballot = await this.buildBallot(token, bigPow(radix, 0), bigPow(radix, k - 1));
      const forged: Ballot = { ...ballot, cipher: (ballot.cipher + ONE) % pub.n2 };
      const r = await this.submit(forged);
      return fail('Modify a ballot in transit', r.ok ? 'Unexpectedly accepted.' : r.reason);
    }

    if (kind === 'multi-vote') {
      const ballot = await this.buildBallot(
        token,
        bigPow(radix, 0) + bigPow(radix, 1),
        bigPow(radix, k - 1) + bigPow(radix, k - 2),
      );
      const r = await this.submit(ballot);
      return {
        kind,
        title: 'One ballot, two candidates',
        counted: r.ok,
        detail: r.ok
          ? 'Token and MAC are genuine, so this ballot is stored. It adds two votes for one voter, which the tally check "votes equal ballots" will flag.'
          : r.reason,
      };
    }

    // unknown-candidate
    const ballot = await this.buildBallot(token, bigPow(radix, k), bigPow(radix, k));
    const r = await this.submit(ballot);
    return {
      kind,
      title: 'Vote for a candidate that does not exist',
      counted: r.ok,
      detail: r.ok
        ? 'Token and MAC are genuine, so this ballot is stored. The extra slot shows up as leftover value when the tally is decoded and is flagged there.'
        : r.reason,
    };
  }
}
