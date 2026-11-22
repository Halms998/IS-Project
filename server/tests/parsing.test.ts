import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatEnvelopes, parseCastVoteOutput, parseTallyOutput } from '../src/crypto/cliRunner';
import { CryptoError } from '../src/types';

// Output copied from a real run of cast-vote.exe on Windows (prompts included).
const REAL_CAST_VOTE_OUTPUT = `Welcome! Please enter your voter ID code (dashes optional):
>>> Your token was successfully verified to be a number. Note that this program does not check whether your token was
actually issued by the election authority. Once your vote is submitted, the election authority should send you a
confirmation. If you do not receive a confirmation, please contact the election authority.

Please pick a candidate between 1 and 3, inclusive. If you do not know who the candidates are, please contact
your election authority.
Enter the number of the candidate that you want to vote for: You picked candidate 2. Are you sure? (Y/N): 
---BEGIN:BALLOT---
J1ou2LOiyrl18IruhsAHcN3btF2qttx29C7wVAYnOEwC850I0KU/RxLtcgUSouckg7qgHiXi
bhvx+fO6uW4xD9hUppfQ6hbn3J9FLO1vgd4yZiMbvKun2JSmoWIKfstkdJL9+2I29zTFYgpz
2O912vVh9De54UtosO/7qtXnBOQkDtFsEA25/foVf3/UoDyh77Agjg==
----END:BALLOT----
---BEGIN:MAC---
WOyvMjP1KwpIqoZZy7jFFdLnS3AMqRXfsE1ksinPl2btrrgKqGInqt93cDbpI9Oo+XpcKyHd
SvTUmbg2eQ3z0ZkIHP4B3nPiRransV8NY9tE4AGHEPPb0S04bSgaVmjXHLUMMOXXyzknmwzW
uhgEsldg+BHhISBXKYnwWICfI4PXnoU9v45zmluuQmXrGhEzDHVuow==
----END:MAC----
`;

// Output copied from a real run of tally-votes.exe.
const REAL_TALLY_OUTPUT = `Here are the election results:
Candidate 1: 0 vote(s)
Candidate 2: 1 vote(s)
Candidate 3: 1 vote(s)

  Envelopes received: 2
  Ballots counted:    2
  Envelopes rejected: 0
  Votes found:        2
`;

describe('parseCastVoteOutput', () => {
  it('extracts the ballot and MAC from real cast-vote output', () => {
    const envelope = parseCastVoteOutput(REAL_CAST_VOTE_OUTPUT);
    assert.ok(envelope.ballot.startsWith('J1ou2LOiyrl18'));
    assert.ok(envelope.ballot.endsWith('Agjg=='));
    assert.ok(envelope.mac.startsWith('WOyvMjP1'));
    assert.ok(!/\s/.test(envelope.ballot));
    assert.ok(!/\s/.test(envelope.mac));
  });

  it('handles Windows line endings', () => {
    const envelope = parseCastVoteOutput(REAL_CAST_VOTE_OUTPUT.replace(/\n/g, '\r\n'));
    assert.ok(!/\s/.test(envelope.ballot));
  });

  it('throws when the ballot is missing', () => {
    assert.throws(() => parseCastVoteOutput('The voter ID code should contain numbers only.'), CryptoError);
  });

  it('throws when the MAC is missing', () => {
    assert.throws(() => parseCastVoteOutput('---BEGIN:BALLOT---\nQUJD\n----END:BALLOT----\n'), CryptoError);
  });

  it('throws when the body is not base 64', () => {
    assert.throws(() => parseCastVoteOutput('---BEGIN:BALLOT---\nnot base64!\n----END:BALLOT----\n---BEGIN:MAC---\nQUJD\n----END:MAC----\n'), CryptoError);
  });
});

describe('formatEnvelopes', () => {
  it('writes sections that tally-votes can read back', () => {
    const text = formatEnvelopes([
      { ballot: 'AAAA', mac: 'BBBB' },
      { ballot: 'CCCC', mac: 'DDDD' },
    ]);
    assert.equal((text.match(/---BEGIN:BALLOT---/g) ?? []).length, 2);
    assert.equal((text.match(/----END:MAC----/g) ?? []).length, 2);
    assert.ok(text.indexOf('AAAA') < text.indexOf('BBBB'));
    assert.ok(text.indexOf('BBBB') < text.indexOf('CCCC'));
  });

  it('is empty when there are no ballots', () => {
    assert.equal(formatEnvelopes([]), '');
  });

  it('round-trips through the cast-vote parser', () => {
    const text = formatEnvelopes([{ ballot: 'QUJDREVG', mac: 'R0hJSktM' }]);
    assert.deepEqual(parseCastVoteOutput(text), { ballot: 'QUJDREVG', mac: 'R0hJSktM' });
  });
});

describe('parseTallyOutput', () => {
  it('reads real tally-votes output', () => {
    const result = parseTallyOutput(REAL_TALLY_OUTPUT, 'Reading votes from stdin...\n', 0);
    assert.deepEqual(result.counts, [0, 1, 1]);
    assert.equal(result.received, 2);
    assert.equal(result.accepted, 2);
    assert.equal(result.rejected, 0);
    assert.equal(result.votesFound, 2);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.rejections, []);
    assert.equal(result.trustworthy, true);
  });

  it('treats exit code 4 as an untrusted result and keeps the warnings', () => {
    const stdout =
      REAL_TALLY_OUTPUT +
      'Warning! The votes found do not match the ballots counted. A ballot may contain more than one vote. The results cannot be trusted.\n';
    const result = parseTallyOutput(stdout, '', 4);
    assert.equal(result.trustworthy, false);
    assert.equal(result.warnings.length, 1);
    assert.deepEqual(result.counts, [0, 1, 1]);
  });

  it('collects the reasons envelopes were rejected', () => {
    const stderr = [
      'Reading votes from stdin...',
      'Rejected: envelope 3: this token has already been used',
      'Rejected: envelope 4: the checksum is incorrect, so the ballot was modified',
    ].join('\n');
    const result = parseTallyOutput(REAL_TALLY_OUTPUT.replace('rejected: 0', 'rejected: 2'), stderr, 0);
    assert.equal(result.rejections.length, 2);
    assert.match(result.rejections[0], /already been used/);
  });

  it('fails on exit codes other than 0 and 4', () => {
    assert.throws(() => parseTallyOutput('', 'The private key file is missing or corrupt.\n', 2), CryptoError);
  });

  it('fails when the output cannot be understood', () => {
    assert.throws(() => parseTallyOutput('something unexpected\n', '', 0), CryptoError);
  });

  it('fails when a candidate line is missing', () => {
    const broken = REAL_TALLY_OUTPUT.replace('Candidate 2: 1 vote(s)\n', '');
    assert.throws(() => parseTallyOutput(broken, '', 0), CryptoError);
  });
});
