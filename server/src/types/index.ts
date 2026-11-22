// Shared types for the API.

export type ElectionStatus = 'open' | 'tallied';

export interface Election {
  id: number;
  name: string;
  candidates: string[];
  numVoters: number;
  status: ElectionStatus;
  createdAt: string;
}

export interface ElectionSummary extends Election {
  tokensIssued: number;
  tokensUsed: number;
  ballotCount: number;
}

// One voter's encrypted ballot and its authenticity code (MAC), both base 64 text.
export interface Envelope {
  ballot: string;
  mac: string;
}

export interface TallyResult {
  // Votes per candidate, in candidate order (index 0 is candidate 1).
  counts: number[];
  received: number;
  accepted: number;
  rejected: number;
  votesFound: number;
  // Integrity warnings printed by tally-votes. Any warning means the result cannot be trusted.
  warnings: string[];
  // Why individual envelopes were rejected, one entry per rejection.
  rejections: string[];
  trustworthy: boolean;
}

// Everything cryptographic goes through this interface, so the API does not care whether the
// work is done by the real C++ programs or by a stand-in used in tests.
export interface CryptoRunner {
  // Generates the election keys and tokens inside `dir`. Returns the tokens.
  createElection(dir: string, numCandidates: number, numVoters: number): Promise<string[]>;
  // Encrypts one vote. `candidate` is 1-based.
  encryptBallot(dir: string, token: string, candidate: number): Promise<Envelope>;
  // Verifies and tallies envelopes, decrypting only the combined total.
  tally(dir: string, envelopes: Envelope[]): Promise<TallyResult>;
}

// An error that is safe to show to API clients.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// A failure while running one of the C++ programs. The details are logged, not sent to clients.
export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}
