import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashToken, normalizeToken } from '../src/services/token';
import { ApiError } from '../src/types';

describe('normalizeToken', () => {
  it('treats hyphens and leading zeros as formatting', () => {
    const typed = '09425-64640-88329-79113-76384-32393-18094-9412';
    assert.equal(normalizeToken(typed), normalizeToken(typed.replace(/-/g, '')));
    assert.equal(normalizeToken('007'), '7');
    assert.equal(normalizeToken(' 12-34 '), '1234');
  });

  it('rejects anything that is not digits and hyphens', () => {
    for (const bad of ['', '   ', '---', '12a4', '12 34', '1e5', '-', '١٢٣', null, undefined, 123, {}]) {
      assert.throws(
        () => normalizeToken(bad),
        (error: unknown) => error instanceof ApiError && error.code === 'INVALID_TOKEN_FORMAT',
        `should reject ${String(bad)}`,
      );
    }
  });

  it('hashes to a stable 64 character value', () => {
    assert.equal(hashToken('1234'), hashToken('1234'));
    assert.notEqual(hashToken('1234'), hashToken('1235'));
    assert.match(hashToken('1234'), /^[0-9a-f]{64}$/);
  });
});
