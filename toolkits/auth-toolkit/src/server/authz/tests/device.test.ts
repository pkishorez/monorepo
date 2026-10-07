import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { nameToken, namedUser } from '../../../contract/index.js';
import { Authz } from '../../../guard/index.js';
import { device } from '../device.js';

const resolveWith = (headers: Record<string, string>) =>
  Effect.runPromise(
    Effect.flatMap(Authz.Resolver, (resolver) =>
      resolver.resolve(new Request('https://api.example.com', { headers })),
    ).pipe(Effect.provide(device)),
  );

describe('device', () => {
  const ada = namedUser({ email: 'ada@demo', name: 'Ada' });
  const token = nameToken.make(ada);

  it('resolves the User a Name Token names, asking no one', async () => {
    const resolved = await resolveWith({ authorization: `Bearer ${token}` });
    expect(resolved).toMatchObject({
      current: {
        kind: 'session',
        user: ada,
        session: { token, userId: ada.id },
      },
      refreshedCookies: [],
    });
  });

  it('is unauthenticated without a Name Token', async () => {
    expect(await resolveWith({})).toBeNull();
    expect(await resolveWith({ cookie: `session=${token}` })).toBeNull();
    expect(
      await resolveWith({ authorization: 'Bearer real-session-token' }),
    ).toBeNull();
  });
});
