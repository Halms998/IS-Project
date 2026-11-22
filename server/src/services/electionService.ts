import fs from 'fs';
import path from 'path';
import { Db } from '../database/db';
import { ApiError, CryptoError, CryptoRunner, Election, ElectionSummary, Envelope, TallyResult } from '../types';
import { AuditService } from './auditService';
import { hashToken, normalizeToken } from './token';

interface ElectionRow {
  id: number;
  name: string;
  candidates: string;
  num_voters: number;
  status: 'open' | 'tallied';
  created_at: string;
}

export interface CreateElectionInput {
  name: unknown;
  candidates: unknown;
  numVoters: unknown;
}

export interface BallotRecord {
  id: number;
  ballot: string;
  mac: string;
  createdAt: string;
}

export interface TallyReport {
  election: Election;
  results: Array<{ candidate: string; votes: number }>;
  received: number;
  accepted: number;
  rejected: number;
  trustworthy: boolean;
  warnings: string[];
  rejections: string[];
}

const MAX_CANDIDATES = 20;
const MAX_VOTERS = 500;

function toElection(row: ElectionRow): Election {
  return {
    id: row.id,
    name: row.name,
    candidates: JSON.parse(row.candidates) as string[],
    numVoters: row.num_voters,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class ElectionService {
  constructor(
    private readonly db: Db,
    private readonly runner: CryptoRunner,
    private readonly audit: AuditService,
    private readonly dataDir: string,
  ) {}

  private electionDir(id: number): string {
    return path.join(this.dataDir, String(id));
  }

  private requireElection(id: number): Election {
    const row = this.db.prepare('SELECT * FROM elections WHERE id = ?').get(id) as ElectionRow | undefined;
    if (!row) {
      throw new ApiError(404, 'ELECTION_NOT_FOUND', 'No election with that id exists.');
    }
    return toElection(row);
  }

  private validateCreate(input: CreateElectionInput): { name: string; candidates: string[]; numVoters: number } {
    if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.trim().length > 100) {
      throw new ApiError(400, 'INVALID_ELECTION', 'The election name must be 1 to 100 characters.');
    }
    if (!Array.isArray(input.candidates) || input.candidates.length < 2 || input.candidates.length > MAX_CANDIDATES) {
      throw new ApiError(400, 'INVALID_ELECTION', `Provide between 2 and ${MAX_CANDIDATES} candidate names.`);
    }
    const candidates: string[] = [];
    for (const candidate of input.candidates) {
      if (typeof candidate !== 'string' || candidate.trim().length < 1 || candidate.trim().length > 60) {
        throw new ApiError(400, 'INVALID_ELECTION', 'Each candidate name must be 1 to 60 characters.');
      }
      candidates.push(candidate.trim());
    }
    if (new Set(candidates.map((c) => c.toLowerCase())).size !== candidates.length) {
      throw new ApiError(400, 'INVALID_ELECTION', 'Candidate names must be different from each other.');
    }
    if (typeof input.numVoters !== 'number' || !Number.isInteger(input.numVoters) || input.numVoters < 2 || input.numVoters > MAX_VOTERS) {
      throw new ApiError(400, 'INVALID_ELECTION', `The number of voters must be a whole number from 2 to ${MAX_VOTERS}.`);
    }
    return { name: input.name.trim(), candidates, numVoters: input.numVoters };
  }

  // Creates an election, generates its keys and tokens, and returns the tokens exactly once.
  // Only the hashes of the tokens are stored in the database.
  async createElection(input: CreateElectionInput): Promise<{ election: Election; tokens: string[] }> {
    const { name, candidates, numVoters } = this.validateCreate(input);
    const insert = this.db
      .prepare('INSERT INTO elections (name, candidates, num_voters) VALUES (?, ?, ?)')
      .run(name, JSON.stringify(candidates), numVoters);
    const id = Number(insert.lastInsertRowid);
    const dir = this.electionDir(id);
    let tokens: string[];
    try {
      tokens = await this.runner.createElection(dir, candidates.length, numVoters);
    } catch (error) {
      this.db.prepare('DELETE FROM elections WHERE id = ?').run(id);
      fs.rmSync(dir, { recursive: true, force: true });
      this.audit.record(null, 'ELECTION_CREATE_FAILED', 'The cryptographic setup failed.');
      console.error('Election setup failed:', error);
      throw new ApiError(502, 'CRYPTO_FAILURE', 'The election could not be set up. Check the server log.');
    }
    const addToken = this.db.prepare('INSERT OR IGNORE INTO voter_tokens (election_id, token_hash) VALUES (?, ?)');
    this.db.transaction(() => {
      for (const token of tokens) {
        addToken.run(id, hashToken(normalizeToken(token)));
      }
    })();
    this.audit.record(id, 'ELECTION_CREATED', `${candidates.length} candidates, ${numVoters} voters`);
    return { election: this.requireElection(id), tokens };
  }

  listElections(): Election[] {
    const rows = this.db.prepare('SELECT * FROM elections ORDER BY id').all() as ElectionRow[];
    return rows.map(toElection);
  }

  getElection(id: number): ElectionSummary {
    const election = this.requireElection(id);
    const issued = this.db.prepare('SELECT COUNT(*) AS n FROM voter_tokens WHERE election_id = ?').get(id) as { n: number };
    const used = this.db.prepare('SELECT COUNT(*) AS n FROM voter_tokens WHERE election_id = ? AND used = 1').get(id) as { n: number };
    const ballots = this.db.prepare('SELECT COUNT(*) AS n FROM ballots WHERE election_id = ?').get(id) as { n: number };
    return { ...election, tokensIssued: issued.n, tokensUsed: used.n, ballotCount: ballots.n };
  }

  private reject(electionId: number, code: string): void {
    this.audit.record(electionId, 'BALLOT_REJECTED', code);
  }

  // Casts one vote: validates the request, spends the token, encrypts the vote and stores only
  // the ciphertext. The chosen candidate is never written to the database or the audit log.
  async castBallot(electionId: number, input: { token: unknown; candidate: unknown }): Promise<{ ballotId: number } & Envelope> {
    const election = this.requireElection(electionId);
    if (election.status !== 'open') {
      this.reject(electionId, 'ELECTION_CLOSED');
      throw new ApiError(409, 'ELECTION_CLOSED', 'Voting in this election has ended.');
    }
    let normalized: string;
    try {
      normalized = normalizeToken(input.token);
    } catch (error) {
      this.reject(electionId, 'INVALID_TOKEN_FORMAT');
      throw error;
    }
    const candidate = input.candidate;
    if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < 1 || candidate > election.candidates.length) {
      this.reject(electionId, 'INVALID_CANDIDATE');
      throw new ApiError(400, 'INVALID_CANDIDATE', `The candidate must be a whole number from 1 to ${election.candidates.length}.`);
    }
    const hash = hashToken(normalized);
    const known = this.db.prepare('SELECT used FROM voter_tokens WHERE election_id = ? AND token_hash = ?').get(electionId, hash) as
      | { used: number }
      | undefined;
    if (!known) {
      this.reject(electionId, 'UNKNOWN_TOKEN');
      throw new ApiError(403, 'UNKNOWN_TOKEN', 'This voter token was not issued for this election.');
    }
    // Claim the token in one atomic step so two simultaneous requests cannot both spend it.
    const claim = this.db.prepare('UPDATE voter_tokens SET used = 1 WHERE election_id = ? AND token_hash = ? AND used = 0').run(electionId, hash);
    if (claim.changes !== 1) {
      this.reject(electionId, 'TOKEN_ALREADY_USED');
      throw new ApiError(409, 'TOKEN_ALREADY_USED', 'This voter token has already been used.');
    }
    let envelope: Envelope;
    try {
      envelope = await this.runner.encryptBallot(this.electionDir(electionId), normalized, candidate);
    } catch (error) {
      // The vote was not recorded, so give the token back and let the voter try again.
      this.db.prepare('UPDATE voter_tokens SET used = 0 WHERE election_id = ? AND token_hash = ?').run(electionId, hash);
      this.audit.record(electionId, 'BALLOT_ENCRYPTION_FAILED', 'The ballot could not be encrypted; the token was released.');
      console.error('Ballot encryption failed:', error instanceof CryptoError ? error.message : error);
      throw new ApiError(502, 'CRYPTO_FAILURE', 'Your ballot could not be encrypted. Your token was not used; please try again.');
    }
    const insert = this.db.prepare('INSERT INTO ballots (election_id, ballot, mac) VALUES (?, ?, ?)').run(electionId, envelope.ballot, envelope.mac);
    const ballotId = Number(insert.lastInsertRowid);
    this.audit.record(electionId, 'BALLOT_ACCEPTED', `ballot ${ballotId}`);
    return { ballotId, ...envelope };
  }

  listBallots(electionId: number): BallotRecord[] {
    this.requireElection(electionId);
    const rows = this.db.prepare('SELECT id, ballot, mac, created_at FROM ballots WHERE election_id = ? ORDER BY id').all(electionId) as Array<{
      id: number;
      ballot: string;
      mac: string;
      created_at: string;
    }>;
    return rows.map((row) => ({ id: row.id, ballot: row.ballot, mac: row.mac, createdAt: row.created_at }));
  }

  // Verifies every stored envelope, decrypts only the combined total, and closes voting.
  async tally(electionId: number): Promise<TallyReport> {
    const election = this.requireElection(electionId);
    const envelopes: Envelope[] = this.listBallots(electionId).map((b) => ({ ballot: b.ballot, mac: b.mac }));
    let result: TallyResult;
    try {
      result = await this.runner.tally(this.electionDir(electionId), envelopes);
    } catch (error) {
      this.audit.record(electionId, 'TALLY_FAILED', 'The tally could not be completed.');
      console.error('Tally failed:', error);
      throw new ApiError(502, 'CRYPTO_FAILURE', 'The tally could not be completed. Check the server log.');
    }
    if (result.counts.length !== election.candidates.length) {
      this.audit.record(electionId, 'TALLY_FAILED', 'The tally output did not match the number of candidates.');
      throw new ApiError(502, 'CRYPTO_FAILURE', 'The tally output did not match the election setup.');
    }
    this.db.prepare("UPDATE elections SET status = 'tallied' WHERE id = ?").run(electionId);
    this.audit.record(
      electionId,
      result.trustworthy ? 'TALLY_COMPLETED' : 'TALLY_UNTRUSTED',
      `${result.accepted} counted, ${result.rejected} rejected, ${result.warnings.length} warning(s)`,
    );
    return {
      election: { ...election, status: 'tallied' },
      results: election.candidates.map((candidate, index) => ({ candidate, votes: result.counts[index] })),
      received: result.received,
      accepted: result.accepted,
      rejected: result.rejected,
      trustworthy: result.trustworthy,
      warnings: result.warnings,
      rejections: result.rejections,
    };
  }
}
