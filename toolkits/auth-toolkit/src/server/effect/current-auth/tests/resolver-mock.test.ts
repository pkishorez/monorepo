import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { mockToken, mockUser } from '../../../../auth-worker-contract/index.js';
import { auth } from '../current-auth.js';
import { resolverMock } from '../resolver-mock.js';

const resolveWith = (headers: Record<string, string>) =>
  Effect.runPromise(
    Effect.flatMap(auth.Resolver, (resolver) =>
      resolver.resolve(new Request('https://api.example.com', { headers })),
    ).pipe(Effect.provide(resolverMock)),
  );

describe('resolverMock', () => {
  const ada = mockUser({ email: 'ada@demo', name: 'Ada' });
  const token = mockToken.make(ada);

  it('resolves the User a Mock Token names, asking no one', async () => {
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

  it('is unauthenticated without a Mock Token', async () => {
    expect(await resolveWith({})).toBeNull();
    expect(await resolveWith({ cookie: `session=${token}` })).toBeNull();
    expect(
      await resolveWith({ authorization: 'Bearer real-session-token' }),
    ).toBeNull();
  });
});
