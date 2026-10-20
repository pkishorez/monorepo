import { describe, expect, it } from 'vitest';
import { mint, verify } from './run-token.ts';

const key = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
const otherKey = Buffer.from(new Uint8Array(32).fill(8)).toString('base64');
const claim = { userId: 'local_ada', runId: 'run-1', expiresAt: 10_000 };

describe('run token', () => {
  it('names the user and the run it was minted for', async () => {
    const token = await mint(key, claim);
    expect(await verify(key, token, 1_000)).toEqual({
      userId: 'local_ada',
      runId: 'run-1',
    });
  });

  it('is refused once it expires', async () => {
    const token = await mint(key, claim);
    expect(await verify(key, token, 10_000)).toBeNull();
  });

  it('is refused under another Vault key', async () => {
    const token = await mint(key, claim);
    expect(await verify(otherKey, token, 1_000)).toBeNull();
  });

  it('cannot be edited to name another user or run', async () => {
    const token = await mint(key, claim);
    const [version, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ u: 'local_bob', r: 'run-1', e: 10_000 }),
    ).toString('base64url');
    expect(
      await verify(key, `${version}.${forged}.${signature}`, 1_000),
    ).toBeNull();
    expect(await verify(key, 'v1.garbage', 1_000)).toBeNull();
    expect(await verify(key, '', 1_000)).toBeNull();
  });
});
