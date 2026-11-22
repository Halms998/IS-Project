import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Config } from '../config/env';
import { CryptoError, CryptoRunner, Envelope, TallyResult } from '../types';

// ---------------------------------------------------------------------------
// Parsing. These are pure functions so they can be tested against real program output.
// ---------------------------------------------------------------------------

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

function extractSection(output: string, tag: string): string | null {
  const pattern = new RegExp(`-+BEGIN:${tag}-+\\s*([\\s\\S]*?)\\s*-+END:${tag}-+`);
  const match = pattern.exec(output);
  if (!match) {
    return null;
  }
  const body = match[1].replace(/\s+/g, '');
  return BASE64_BODY.test(body) ? body : null;
}

// Reads the ballot and MAC that cast-vote prints between BEGIN/END markers.
export function parseCastVoteOutput(stdout: string): Envelope {
  const ballot = extractSection(stdout, 'BALLOT');
  const mac = extractSection(stdout, 'MAC');
  if (!ballot || !mac) {
    throw new CryptoError('cast-vote did not print a valid ballot and MAC.');
  }
  return { ballot, mac };
}

// Formats envelopes the way tally-votes expects them on standard input.
export function formatEnvelopes(envelopes: Envelope[]): string {
  return (
    envelopes
      .map((e) => `---BEGIN:BALLOT---\n${e.ballot}\n----END:BALLOT----\n---BEGIN:MAC---\n${e.mac}\n----END:MAC----\n`)
      .join('') || ''
  );
}

function readNumber(text: string, label: string): number | null {
  const match = new RegExp(`${label}:\\s+(\\d+)`).exec(text);
  return match ? Number(match[1]) : null;
}

// Reads the results that tally-votes prints. An exit code of 4 means "ran, but the results
// cannot be trusted", which is still a result. Any other non-zero code is a failure.
export function parseTallyOutput(stdout: string, stderr: string, exitCode: number): TallyResult {
  if (exitCode !== 0 && exitCode !== 4) {
    throw new CryptoError(`tally-votes failed with exit code ${exitCode}: ${stderr.trim().slice(0, 300)}`);
  }
  const counts: number[] = [];
  const candidatePattern = /^Candidate (\d+): (\d+) vote\(s\)/gm;
  let match: RegExpExecArray | null;
  while ((match = candidatePattern.exec(stdout)) !== null) {
    const index = Number(match[1]) - 1;
    counts[index] = Number(match[2]);
  }
  const received = readNumber(stdout, 'Envelopes received');
  const accepted = readNumber(stdout, 'Ballots counted');
  const rejected = readNumber(stdout, 'Envelopes rejected');
  const votesFound = readNumber(stdout, 'Votes found');
  if (counts.length === 0 || Array.from(counts).some((c) => c === undefined) || received === null || accepted === null || rejected === null || votesFound === null) {
    throw new CryptoError('tally-votes printed output that could not be understood.');
  }
  const warnings = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Warning'));
  const rejections = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Rejected:') || line.startsWith('Error:'));
  return {
    counts,
    received,
    accepted,
    rejected,
    votesFound,
    warnings,
    rejections,
    trustworthy: exitCode === 0,
  };
}

// ---------------------------------------------------------------------------
// Running the programs.
// ---------------------------------------------------------------------------

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class CliCryptoRunner implements CryptoRunner {
  constructor(private readonly config: Pick<Config, 'cryptoBinDir' | 'cryptoDllDir' | 'cryptoTimeoutMs'>) {}

  private binaryPath(name: string): string {
    const file = path.join(this.config.cryptoBinDir, process.platform === 'win32' ? `${name}.exe` : name);
    if (!fs.existsSync(file)) {
      throw new CryptoError(`The program ${file} was not found. Build the C++ tools first (run make in the repository root).`);
    }
    return file;
  }

  // Starts one program with no shell, feeds it standard input, and collects its output.
  private run(name: string, cwd: string, stdin: string): Promise<RunResult> {
    const file = this.binaryPath(name);
    const env = { ...process.env };
    if (this.config.cryptoDllDir) {
      env.PATH = `${this.config.cryptoDllDir}${path.delimiter}${env.PATH ?? ''}`;
    }
    return new Promise((resolve, reject) => {
      const child = spawn(file, [], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (action: () => void) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          action();
        }
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new CryptoError(`${name} did not finish within ${this.config.cryptoTimeoutMs} ms and was stopped.`)));
      }, this.config.cryptoTimeoutMs);
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.on('error', (error) => finish(() => reject(new CryptoError(`Could not start ${name}: ${error.message}`))));
      child.on('close', (code) => finish(() => resolve({ code: code ?? -1, stdout, stderr })));
      // A program that exits before reading all of its input closes the pipe; that is not an error here.
      child.stdin.on('error', () => undefined);
      child.stdin.end(stdin);
    });
  }

  async createElection(dir: string, numCandidates: number, numVoters: number): Promise<string[]> {
    fs.mkdirSync(dir, { recursive: true });
    const keygen = await this.run('admin-keygen', dir, `${numCandidates}\n${numVoters}\n`);
    if (keygen.code !== 0 || !fs.existsSync(path.join(dir, 'public-key.txt')) || !fs.existsSync(path.join(dir, 'private-key.txt'))) {
      throw new CryptoError(`admin-keygen failed (exit code ${keygen.code}): ${keygen.stderr.trim().slice(0, 300)}`);
    }
    const tokensRun = await this.run('admin-tokens', dir, '');
    if (tokensRun.code !== 0) {
      throw new CryptoError(`admin-tokens failed (exit code ${tokensRun.code}): ${tokensRun.stderr.trim().slice(0, 300)}`);
    }
    const tokens = fs
      .readFileSync(path.join(dir, 'tokens.txt'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (tokens.length !== numVoters) {
      throw new CryptoError(`Expected ${numVoters} tokens but admin-tokens wrote ${tokens.length}.`);
    }
    return tokens;
  }

  async encryptBallot(dir: string, token: string, candidate: number): Promise<Envelope> {
    const result = await this.run('cast-vote', dir, `${token}\n${candidate}\ny\n`);
    if (result.code !== 0) {
      throw new CryptoError(`cast-vote failed (exit code ${result.code}): ${result.stderr.trim().slice(0, 300)}`);
    }
    return parseCastVoteOutput(result.stdout);
  }

  async tally(dir: string, envelopes: Envelope[]): Promise<TallyResult> {
    const result = await this.run('tally-votes', dir, formatEnvelopes(envelopes));
    return parseTallyOutput(result.stdout, result.stderr, result.code);
  }
}
