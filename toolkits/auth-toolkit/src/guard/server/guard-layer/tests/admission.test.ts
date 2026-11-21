import { Effect, Option } from 'effect';
import { describe, expect, it } from 'vitest';

import type { Principal } from '../../../authz/middleware/index.js';
import { admit, type Resolution } from '../admission.js';

const session = { id: 's1' };
const ada = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

describe('admit', () => {
  const resolution: Resolution = {
    principal: {
      kind: 'session',
      session,
      user: ada,
    } as unknown as Principal,
    refreshedCookies: [],
  };
  const run = (resolved: Resolution | null) =>
    Effect.runPromise(
      Effect.result(
        admit(
          resolved,
          new Request('https://api.example.com'),
          Option.none(),
          {},
        ),
      ),
    );

  it('admits whoever the call is from, with no policy', async () => {
    expect(await run(resolution)).toMatchObject({
      success: { kind: 'session', user: ada },
    });
  });

  it('refuses nobody Unauthenticated', async () => {
    expect(await run(null)).toMatchObject({
      failure: { _tag: 'Unauthenticated' },
    });
  });
});
