import { betterAuth } from 'better-auth';
import { expect, it } from 'vitest';
import { memoryPrimaryDatabase } from './memory.js';

it('reads a session with its user through Drizzle Relations v2 joins', async () => {
  const auth = betterAuth({
    baseURL: 'https://auth.example.com',
    secret: 'test-secret-test-secret-test-secret',
    database: memoryPrimaryDatabase(),
    advanced: { database: { joins: true } },
  });
  const { internalAdapter } = await auth.$context;
  const user = await internalAdapter.createUser(
    {
      name: 'Relations test',
      email: 'relations@example.com',
      emailVerified: true,
    },
    { method: 'email-password' },
  );
  const session = await internalAdapter.createSession(user.id);

  expect(await internalAdapter.findSession(session.token)).toMatchObject({
    user: { id: user.id, email: user.email },
    session: { id: session.id, userId: user.id },
  });
});
