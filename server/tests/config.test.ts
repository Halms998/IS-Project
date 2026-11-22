import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig, loadDotEnv } from '../src/config/env';

describe('loadConfig', () => {
  it('refuses to start without an admin key', () => {
    assert.throws(() => loadConfig({}), /ADMIN_API_KEY/);
    assert.throws(() => loadConfig({ ADMIN_API_KEY: 'short' }), /ADMIN_API_KEY/);
  });

  it('uses safe defaults', () => {
    const config = loadConfig({ ADMIN_API_KEY: 'x'.repeat(20) }, '/srv/app');
    assert.equal(config.port, 3001);
    assert.equal(config.databasePath, path.resolve('/srv/app', './data/ballot.db'));
    assert.equal(config.cryptoBinDir, path.resolve('/srv/app', '..'));
    assert.equal(config.cryptoDllDir, undefined);
  });

  it('rejects an invalid port or timeout', () => {
    assert.throws(() => loadConfig({ ADMIN_API_KEY: 'x'.repeat(20), PORT: 'abc' }), /PORT/);
    assert.throws(() => loadConfig({ ADMIN_API_KEY: 'x'.repeat(20), PORT: '70000' }), /PORT/);
    assert.throws(() => loadConfig({ ADMIN_API_KEY: 'x'.repeat(20), CRYPTO_TIMEOUT_MS: '5' }), /CRYPTO_TIMEOUT_MS/);
  });
});

describe('loadDotEnv', () => {
  it('reads values, skips comments, strips quotes and never overrides real variables', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ballot-env-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, '# comment\nPORT=4000\nADMIN_API_KEY="quoted-secret-value"\nEMPTY=\r\nKEEP=from-file\n');
    const env: NodeJS.ProcessEnv = { KEEP: 'from-process' };
    loadDotEnv(file, env);
    assert.equal(env.PORT, '4000');
    assert.equal(env.ADMIN_API_KEY, 'quoted-secret-value');
    assert.equal(env.KEEP, 'from-process');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when the file does not exist', () => {
    const env: NodeJS.ProcessEnv = {};
    loadDotEnv('/definitely/not/here/.env', env);
    assert.deepEqual(env, {});
  });
});
