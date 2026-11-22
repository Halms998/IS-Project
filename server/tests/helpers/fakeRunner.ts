import { randomBytes } from 'crypto';
import { CryptoRunner, Envelope, TallyResult } from '../../src/types';

// A stand-in for the C++ programs. It "encrypts" a vote into random-looking base 64 text and
// remembers the choice privately so it can tally later. The API under test never sees the choice.
export class FakeCryptoRunner implements CryptoRunner {
  private readonly choices = new Map<string, number>();
  private tokenCounter = 0;
  failNextEncrypt = false;
  failNextCreate = false;
  encryptCalls = 0;
  delayMs = 0;
  // Extra warnings to report from the next tally, to simulate an untrusted result.
  nextTallyWarnings: string[] = [];

  async createElection(_dir: string, _numCandidates: number, numVoters: number): Promise<string[]> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error('simulated keygen failure');
    }
    const tokens: string[] = [];
    for (let i = 0; i < numVoters; i++) {
      this.tokenCounter += 1;
      const digits = (BigInt(this.tokenCounter) * 1000003n + 12345678901234567890n).toString().padStart(39, '0');
      tokens.push(digits.match(/.{1,5}/g)!.join('-'));
    }
    return tokens;
  }

  async encryptBallot(_dir: string, _token: string, candidate: number): Promise<Envelope> {
    this.encryptCalls += 1;
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    if (this.failNextEncrypt) {
      this.failNextEncrypt = false;
      throw new Error('simulated encryption failure');
    }
    const ballot = randomBytes(48).toString('base64');
    const mac = randomBytes(48).toString('base64');
    this.choices.set(ballot, candidate);
    return { ballot, mac };
  }

  async tally(_dir: string, envelopes: Envelope[]): Promise<TallyResult> {
    const counts: number[] = [];
    let accepted = 0;
    for (const envelope of envelopes) {
      const choice = this.choices.get(envelope.ballot);
      if (choice !== undefined) {
        counts[choice - 1] = (counts[choice - 1] ?? 0) + 1;
        accepted += 1;
      }
    }
    const warnings = this.nextTallyWarnings;
    this.nextTallyWarnings = [];
    return {
      counts: Array.from({ length: 3 }, (_unused, i) => counts[i] ?? 0),
      received: envelopes.length,
      accepted,
      rejected: envelopes.length - accepted,
      votesFound: accepted,
      warnings,
      rejections: [],
      trustworthy: warnings.length === 0,
    };
  }
}
