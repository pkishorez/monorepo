import { Effect, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import type { Principal } from '../../guard/index.js';
import { admit, type Resolution } from '../admission.js';

const session = { id: 's1' };
const tess = { id: 't1', email: 'Tess@Example.TEST', name: 'Tess' };

describe('admit', () => {
  const resolution = (test: boolean): Resolution => ({
    principal: {
      kind: 'session',
      session,
      user: tess,
      test,
    } as unknown as Principal,
    refreshedCookies: [],
  });
  const run = (resolved: Resolution, testUsers: boolean) =>
    Effect.runPromise(
      Effect.result(
        admit(
          resolved,
          new Request('https://api.example.com'),
          Option.none(),
          {},
          testUsers,
        ),
      ),
    );

  it('refuses a Test User Forbidden, unless testUsers', async () => {
    expect(await run(resolution(true), false)).toMatchObject({
      failure: { _tag: 'Forbidden', reason: 'Test Users are not accepted' },
    });
    expect(await run(resolution(true), true)).toMatchObject({
      success: { test: true },
    });
  });

  it('admits anyone else either way', async () => {
    for (const testUsers of [false, true]) {
      expect(await run(resolution(false), testUsers)).toMatchObject({
        success: { test: false },
      });
    }
  });
});
