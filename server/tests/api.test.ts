import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer, TestServer } from './helpers/testServer';

describe('API', () => {
  let s: TestServer;
  before(async () => {
    s = await startTestServer();
  });
  after(async () => {
    await s.close();
  });

  async function newElection(numVoters = 4): Promise<{ id: number; tokens: string[] }> {
    const res = await s.admin('POST', '/api/elections', { name: 'Class rep', candidates: ['Ayesha', 'Bilal', 'Chand'], numVoters });
    assert.equal(res.status, 201);
    return { id: res.json.election.id, tokens: res.json.tokens };
  }

  it('reports health', async () => {
    const res = await s.request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.status, 'ok');
  });

  it('returns a consistent JSON error for unknown routes', async () => {
    const res = await s.request('GET', '/api/nothing');
    assert.equal(res.status, 404);
    assert.equal(res.json.error.code, 'NOT_FOUND');
  });

  describe('creating elections', () => {
    it('requires the admin key', async () => {
      const none = await s.request('POST', '/api/elections', { name: 'x', candidates: ['a', 'b'], numVoters: 2 });
      assert.equal(none.status, 401);
      const wrong = await s.request('POST', '/api/elections', { name: 'x', candidates: ['a', 'b'], numVoters: 2 }, { 'x-admin-key': 'wrong' });
      assert.equal(wrong.status, 401);
      assert.equal(wrong.json.error.code, 'UNAUTHORIZED');
    });

    it('returns the tokens once and stores only hashes', async () => {
      const { id, tokens } = await newElection(3);
      assert.equal(tokens.length, 3);
      const rows = s.db.prepare('SELECT token_hash FROM voter_tokens WHERE election_id = ?').all(id) as Array<{ token_hash: string }>;
      assert.equal(rows.length, 3);
      for (const row of rows) {
        assert.match(row.token_hash, /^[0-9a-f]{64}$/);
        for (const token of tokens) {
          assert.notEqual(row.token_hash, token);
        }
      }
      const detail = await s.request('GET', `/api/elections/${id}`);
      assert.equal(detail.json.tokens, undefined);
      assert.equal(detail.json.tokensIssued, 3);
      assert.equal(detail.json.tokensUsed, 0);
    });

    for (const [label, body] of [
      ['a missing name', { candidates: ['a', 'b'], numVoters: 2 }],
      ['one candidate', { name: 'x', candidates: ['a'], numVoters: 2 }],
      ['duplicate candidates', { name: 'x', candidates: ['a', 'A'], numVoters: 2 }],
      ['a blank candidate', { name: 'x', candidates: ['a', '  '], numVoters: 2 }],
      ['one voter', { name: 'x', candidates: ['a', 'b'], numVoters: 1 }],
      ['a fractional voter count', { name: 'x', candidates: ['a', 'b'], numVoters: 2.5 }],
      ['a text voter count', { name: 'x', candidates: ['a', 'b'], numVoters: '3' }],
      ['too many voters', { name: 'x', candidates: ['a', 'b'], numVoters: 501 }],
    ] as Array<[string, unknown]>) {
      it(`rejects ${label}`, async () => {
        const res = await s.admin('POST', '/api/elections', body);
        assert.equal(res.status, 400);
        assert.equal(res.json.error.code, 'INVALID_ELECTION');
      });
    }

    it('rejects a body that is not JSON', async () => {
      const res = await s.request('POST', '/api/elections', '{not json', { 'x-admin-key': 'test-admin-key-0123456789' });
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'INVALID_JSON');
    });

    it('rolls back when the cryptographic setup fails', async () => {
      const before = (s.db.prepare('SELECT COUNT(*) AS n FROM elections').get() as { n: number }).n;
      s.runner.failNextCreate = true;
      const res = await s.admin('POST', '/api/elections', { name: 'x', candidates: ['a', 'b'], numVoters: 2 });
      assert.equal(res.status, 502);
      assert.equal(res.json.error.code, 'CRYPTO_FAILURE');
      const after = (s.db.prepare('SELECT COUNT(*) AS n FROM elections').get() as { n: number }).n;
      assert.equal(after, before);
    });

    it('returns 404 for an unknown election', async () => {
      assert.equal((await s.request('GET', '/api/elections/9999')).status, 404);
      assert.equal((await s.request('GET', '/api/elections/abc')).status, 404);
    });
  });

  describe('casting ballots', () => {
    it('accepts a valid ballot and returns ciphertext only', async () => {
      const { id, tokens } = await newElection();
      const res = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 2 });
      assert.equal(res.status, 201);
      assert.ok(res.json.ballot.length > 20);
      assert.ok(res.json.mac.length > 20);
      assert.equal(res.json.candidate, undefined);
    });

    it('never stores the chosen candidate or links a ballot to a token', async () => {
      const columns = (s.db.prepare("PRAGMA table_info('ballots')").all() as Array<{ name: string }>).map((c) => c.name);
      assert.deepEqual(columns.sort(), ['ballot', 'created_at', 'election_id', 'id', 'mac']);
      const { id, tokens } = await newElection();
      await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 3 });
      const events = await s.admin('GET', `/api/elections/${id}/audit`);
      assert.ok(events.json.events.some((e: any) => e.type === 'BALLOT_ACCEPTED'));
      assert.ok(!JSON.stringify(events.json).includes('candidate 3'));
    });

    it('accepts a token typed with or without hyphens', async () => {
      const { id, tokens } = await newElection();
      const res = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[1].replace(/-/g, ''), candidate: 1 });
      assert.equal(res.status, 201);
      const again = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[1], candidate: 1 });
      assert.equal(again.status, 409);
    });

    it('rejects a reused token', async () => {
      const { id, tokens } = await newElection();
      assert.equal((await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 })).status, 201);
      const second = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 2 });
      assert.equal(second.status, 409);
      assert.equal(second.json.error.code, 'TOKEN_ALREADY_USED');
      const detail = await s.request('GET', `/api/elections/${id}`);
      assert.equal(detail.json.ballotCount, 1);
    });

    it('rejects a token that was never issued', async () => {
      const { id } = await newElection();
      const res = await s.request('POST', `/api/elections/${id}/ballots`, { token: '12345-67890', candidate: 1 });
      assert.equal(res.status, 403);
      assert.equal(res.json.error.code, 'UNKNOWN_TOKEN');
    });

    it("rejects another election's token", async () => {
      const a = await newElection();
      const b = await newElection();
      const res = await s.request('POST', `/api/elections/${b.id}/ballots`, { token: a.tokens[0], candidate: 1 });
      assert.equal(res.status, 403);
    });

    for (const [label, token] of [
      ['an empty token', ''],
      ['a blank token', '   '],
      ['a missing token', undefined],
      ['a numeric token', 12345],
      ['letters in the token', '1234-abcd'],
      ['only hyphens', '---'],
      ['an enormous token', '9'.repeat(700)],
    ] as Array<[string, unknown]>) {
      it(`rejects ${label}`, async () => {
        const { id } = await newElection();
        const res = await s.request('POST', `/api/elections/${id}/ballots`, { token, candidate: 1 });
        assert.equal(res.status, 400);
        assert.equal(res.json.error.code, 'INVALID_TOKEN_FORMAT');
      });
    }

    for (const [label, candidate] of [
      ['zero', 0],
      ['a candidate past the end', 4],
      ['a negative number', -1],
      ['a fraction', 1.5],
      ['text', '2'],
      ['a missing candidate', undefined],
    ] as Array<[string, unknown]>) {
      it(`rejects an invalid candidate: ${label}`, async () => {
        const { id, tokens } = await newElection();
        const res = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate });
        assert.equal(res.status, 400);
        assert.equal(res.json.error.code, 'INVALID_CANDIDATE');
        // A rejected ballot must not spend the token.
        const ok = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
        assert.equal(ok.status, 201);
      });
    }

    it('rejects a body that is not an object', async () => {
      const { id } = await newElection();
      const res = await s.request('POST', `/api/elections/${id}/ballots`, '[1,2,3]');
      assert.equal(res.status, 400);
      assert.equal(res.json.error.code, 'INVALID_BODY');
    });

    it('releases the token if encryption fails, so the voter can retry', async () => {
      const { id, tokens } = await newElection();
      s.runner.failNextEncrypt = true;
      const failed = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      assert.equal(failed.status, 502);
      assert.equal(failed.json.error.code, 'CRYPTO_FAILURE');
      assert.equal((await s.request('GET', `/api/elections/${id}`)).json.ballotCount, 0);
      const retry = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      assert.equal(retry.status, 201);
    });

    it('lets only one of several simultaneous requests spend a token', async () => {
      const { id, tokens } = await newElection();
      s.runner.delayMs = 30;
      const results = await Promise.all(
        Array.from({ length: 6 }, () => s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 })),
      );
      s.runner.delayMs = 0;
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 409).length, 5);
      assert.equal((await s.request('GET', `/api/elections/${id}`)).json.ballotCount, 1);
    });

    it('lists stored ballots as ciphertext', async () => {
      const { id, tokens } = await newElection();
      await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      const res = await s.request('GET', `/api/elections/${id}/ballots`);
      assert.equal(res.status, 200);
      assert.equal(res.json.ballots.length, 1);
      assert.deepEqual(Object.keys(res.json.ballots[0]).sort(), ['ballot', 'createdAt', 'id', 'mac']);
    });
  });

  describe('tallying', () => {
    it('requires the admin key', async () => {
      const { id } = await newElection();
      assert.equal((await s.request('POST', `/api/elections/${id}/tally`)).status, 401);
    });

    it('returns counts by candidate name and then closes voting', async () => {
      const { id, tokens } = await newElection(4);
      const votes = [2, 2, 3, 1];
      for (let i = 0; i < votes.length; i++) {
        assert.equal((await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[i], candidate: votes[i] })).status, 201);
      }
      const res = await s.admin('POST', `/api/elections/${id}/tally`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.results, [
        { candidate: 'Ayesha', votes: 1 },
        { candidate: 'Bilal', votes: 2 },
        { candidate: 'Chand', votes: 1 },
      ]);
      assert.equal(res.json.accepted, 4);
      assert.equal(res.json.trustworthy, true);
      assert.equal(res.json.election.status, 'tallied');
      const late = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      assert.equal(late.status, 409);
    });

    it('rejects a ballot after the election has been tallied', async () => {
      const { id, tokens } = await newElection();
      await s.admin('POST', `/api/elections/${id}/tally`);
      const res = await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      assert.equal(res.status, 409);
      assert.equal(res.json.error.code, 'ELECTION_CLOSED');
    });

    it('reports integrity warnings and marks the result untrusted', async () => {
      const { id, tokens } = await newElection();
      await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      s.runner.nextTallyWarnings = ['Warning! The votes found do not match the ballots counted.'];
      const res = await s.admin('POST', `/api/elections/${id}/tally`);
      assert.equal(res.status, 200);
      assert.equal(res.json.trustworthy, false);
      assert.equal(res.json.warnings.length, 1);
      const events = await s.admin('GET', `/api/elections/${id}/audit`);
      assert.ok(events.json.events.some((e: any) => e.type === 'TALLY_UNTRUSTED'));
    });
  });

  describe('audit log', () => {
    it('requires the admin key', async () => {
      const { id } = await newElection();
      assert.equal((await s.request('GET', `/api/elections/${id}/audit`)).status, 401);
    });

    it('records every rejected ballot with its reason', async () => {
      const { id, tokens } = await newElection();
      await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[0], candidate: 1 });
      await s.request('POST', `/api/elections/${id}/ballots`, { token: '11111', candidate: 1 });
      await s.request('POST', `/api/elections/${id}/ballots`, { token: tokens[1], candidate: 9 });
      await s.request('POST', `/api/elections/${id}/ballots`, { token: 'bad!', candidate: 1 });
      const res = await s.admin('GET', `/api/elections/${id}/audit`);
      const details = res.json.events.filter((e: any) => e.type === 'BALLOT_REJECTED').map((e: any) => e.detail);
      assert.deepEqual(details, ['TOKEN_ALREADY_USED', 'UNKNOWN_TOKEN', 'INVALID_CANDIDATE', 'INVALID_TOKEN_FORMAT']);
    });

    it('records failed admin logins', async () => {
      await s.request('POST', '/api/elections', {}, { 'x-admin-key': 'nope' });
      const row = s.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE type = 'ADMIN_AUTH_FAILED'").get() as { n: number };
      assert.ok(row.n >= 1);
    });
  });
});
