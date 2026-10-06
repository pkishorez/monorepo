import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  localToken,
  localUser,
} from '../../../../auth-worker-contract/index.js';
import { auth } from '../current-auth.js';
import { resolverLocal } from '../resolver-local.js';

const resolveWith = (headers: Record<string, string>) =>
  Effect.runPromise(
    Effect.flatMap(auth.Resolver, (resolver) =>
      resolver.resolve(new Request('https://api.example.com', { headers })),
    ).pipe(Effect.provide(resolverLocal)),
  );

describe('resolverLocal', () => {
  const ada = localUser({ email: 'ada@demo', name: 'Ada' });
  const token = localToken.make(ada);

  it('resolves the User a Local Token names, asking no one', async () => {
    const resolved = await resolveWith({ authorization: `Bearer ${token}` });
    expect(resolved).toMatchObject({
      currentAuth: {
        kind: 'session',
        user: ada,
        session: { token, userId: ada.id },
      },
      refreshedCookies: [],
    });
  });

  it('is unauthenticated without a Local Token', async () => {
    expect(await resolveWith({})).toBeNull();
    expect(await resolveWith({ cookie: `session=${token}` })).toBeNull();
    expect(
      await resolveWith({ authorization: 'Bearer real-session-token' }),
    ).toBeNull();
  });
});
