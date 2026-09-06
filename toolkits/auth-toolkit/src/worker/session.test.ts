import { makeSignature } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { memoryPrimaryDatabase } from '../infra/primary/sqlite/memory/index.js';
import { createAuthWorker } from './worker.js';

describe('database sessions', () => {
  it('reads and revokes a persisted session across worker instances', async () => {
    const config = {
      baseURL: 'https://auth.example.com',
      secret: 'test-secret-test-secret-test-secret',
      database: memoryPrimaryDatabase(),
      google: { clientId: 'test', clientSecret: 'test' },
      trustedOrigins: ['https://app.example.com'],
    };
    const writer = createAuthWorker(config);
    const context = await writer.auth.$context;
    const user = await context.internalAdapter.createUser(
      {
        name: 'Session test',
        email: 'session@example.com',
        emailVerified: true,
      },
      { method: 'email-password' },
    );
    const session = await context.internalAdapter.createSession(user.id);
    const signature = await makeSignature(session.token, config.secret);
    const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`;
    const reader = createAuthWorker(config);
    const readSession = () =>
      reader.handler(
        new Request(`${config.baseURL}/api/auth/get-session`, {
          headers: { cookie },
        }),
      );

    const response = await readSession();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: user.id },
      session: { id: session.id },
    });

    const signOut = await writer.handler(
      new Request(`${config.baseURL}/api/auth/sign-out`, {
        method: 'POST',
        headers: { cookie, origin: 'https://app.example.com' },
      }),
    );
    expect(signOut.status).toBe(200);
    expect(await context.internalAdapter.findSession(session.token)).toBeNull();
    // Replay the token without a cookie cache: revocation must be read from DB.
    expect(await (await readSession()).json()).toBeNull();
  });
});
