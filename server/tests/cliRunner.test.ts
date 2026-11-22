import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { CliCryptoRunner } from '../src/crypto/cliRunner';
import { CryptoError } from '../src/types';

// These tests run the real process-spawning code against small shell scripts that imitate the
// C++ programs' prompts, files and output. They check stdin, the working directory, exit codes
// and timeouts. They do not test the cryptography itself.
const skip = process.platform === 'win32' ? 'uses shell scripts' : false;

function writeScript(dir: string, name: string, body: string): void {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
}

describe('CliCryptoRunner with mock programs', { skip }, () => {
  let binDir: string;
  let workDir: string;
  let runner: CliCryptoRunner;

  before(() => {
    binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ballot-bin-'));
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ballot-work-'));
    writeScript(
      binDir,
      'admin-keygen',
      `read c; read v
if [ -n "$MOCK_KEYGEN_FAIL" ]; then echo "There must be at least two candidates" >&2; exit 1; fi
printf 'ABCDEF\\n%s\\n%s\\n' "$c" "$v" > public-key.txt
echo PRIVATEHEX > private-key.txt
echo "This process has completed."`,
    );
    writeScript(
      binDir,
      'admin-tokens',
      `v=$(sed -n 3p public-key.txt)
n=\${MOCK_TOKEN_COUNT:-$v}
for i in $(seq 1 $n); do printf '%05d-00000-00000-%05d\\n' $i $((i*7)); done > tokens.txt`,
    );
    writeScript(
      binDir,
      'cast-vote',
      `test -f public-key.txt || { echo "no public key in cwd" >&2; exit 1; }
read token; read candidate; read confirm
if [ "$confirm" != "y" ]; then exit 3; fi
if [ -n "$MOCK_SLEEP" ]; then sleep $MOCK_SLEEP; fi
echo "Welcome! voter $token chose $candidate"
printf -- '---BEGIN:BALLOT---\\nQUJD\\nREVG\\n----END:BALLOT----\\n---BEGIN:MAC---\\nR0hJ\\n----END:MAC----\\n'`,
    );
    writeScript(
      binDir,
      'tally-votes',
      `test -f private-key.txt || { echo "The private key file is missing or corrupt." >&2; exit 2; }
n=$(grep -c 'BEGIN:BALLOT')
echo "Here are the election results:"
echo "Candidate 1: $n vote(s)"
echo "Candidate 2: 0 vote(s)"
echo "Candidate 3: 0 vote(s)"
printf '\\n  Envelopes received: %s\\n  Ballots counted:    %s\\n  Envelopes rejected: 0\\n  Votes found:        %s\\n' $n $n $n
exit \${MOCK_TALLY_EXIT:-0}`,
    );
    runner = new CliCryptoRunner({ cryptoBinDir: binDir, cryptoDllDir: undefined, cryptoTimeoutMs: 5000 });
  });

  after(() => {
    fs.rmSync(binDir, { recursive: true, force: true });
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('creates keys and returns one token per voter, inside the election folder', async () => {
    const dir = path.join(workDir, '1');
    const tokens = await runner.createElection(dir, 3, 5);
    assert.equal(tokens.length, 5);
    assert.ok(fs.existsSync(path.join(dir, 'public-key.txt')));
    assert.ok(fs.existsSync(path.join(dir, 'private-key.txt')));
    assert.equal(fs.readFileSync(path.join(dir, 'public-key.txt'), 'utf8').split('\n')[1], '3');
  });

  it('fails when admin-keygen fails', async () => {
    process.env.MOCK_KEYGEN_FAIL = '1';
    try {
      await assert.rejects(runner.createElection(path.join(workDir, '2'), 3, 5), CryptoError);
    } finally {
      delete process.env.MOCK_KEYGEN_FAIL;
    }
  });

  it('fails when the wrong number of tokens is written', async () => {
    process.env.MOCK_TOKEN_COUNT = '2';
    try {
      await assert.rejects(runner.createElection(path.join(workDir, '3'), 3, 5), /Expected 5 tokens/);
    } finally {
      delete process.env.MOCK_TOKEN_COUNT;
    }
  });

  it('sends the token, candidate and confirmation and parses the ballot', async () => {
    const dir = path.join(workDir, '1');
    const envelope = await runner.encryptBallot(dir, '12345', 2);
    assert.deepEqual(envelope, { ballot: 'QUJDREVG', mac: 'R0hJ' });
  });

  it('fails when cast-vote exits with an error', async () => {
    // No public key in this folder, so the mock program exits with an error.
    const empty = fs.mkdtempSync(path.join(workDir, 'empty-'));
    await assert.rejects(runner.encryptBallot(empty, '12345', 1), CryptoError);
  });

  it('stops a program that runs too long', async () => {
    const quick = new CliCryptoRunner({ cryptoBinDir: binDir, cryptoDllDir: undefined, cryptoTimeoutMs: 1000 });
    process.env.MOCK_SLEEP = '5';
    try {
      const started = Date.now();
      await assert.rejects(quick.encryptBallot(path.join(workDir, '1'), '1', 1), /did not finish/);
      assert.ok(Date.now() - started < 4000);
    } finally {
      delete process.env.MOCK_SLEEP;
    }
  });

  it('tallies envelopes passed on standard input', async () => {
    const result = await runner.tally(path.join(workDir, '1'), [
      { ballot: 'AAAA', mac: 'BBBB' },
      { ballot: 'CCCC', mac: 'DDDD' },
    ]);
    assert.deepEqual(result.counts, [2, 0, 0]);
    assert.equal(result.received, 2);
    assert.equal(result.trustworthy, true);
  });

  it('treats exit code 4 as an untrusted result', async () => {
    process.env.MOCK_TALLY_EXIT = '4';
    try {
      const result = await runner.tally(path.join(workDir, '1'), [{ ballot: 'AAAA', mac: 'BBBB' }]);
      assert.equal(result.trustworthy, false);
    } finally {
      delete process.env.MOCK_TALLY_EXIT;
    }
  });

  it('fails when tally-votes cannot find its key', async () => {
    const empty = fs.mkdtempSync(path.join(workDir, 'nokey-'));
    await assert.rejects(runner.tally(empty, []), /exit code 2/);
  });

  it('explains how to fix a missing program', async () => {
    const missing = new CliCryptoRunner({ cryptoBinDir: path.join(workDir, 'nope'), cryptoDllDir: undefined, cryptoTimeoutMs: 1000 });
    await assert.rejects(missing.encryptBallot(workDir, '1', 1), /Build the C\+\+ tools first/);
  });
});
