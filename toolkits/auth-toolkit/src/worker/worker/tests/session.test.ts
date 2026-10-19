import { describe, expect, it } from 'vitest';
import { memory } from '../../database/sqlite/memory/index.js';
import { authWorker } from '../worker.js';
import { config, get, post, signIn } from './fixture.js';

describe('database sessions', () => {
  it('reads and revokes a persisted session across worker instances', async () => {
    const shared = { ...config, database: memory() };
    const writer = authWorker(shared);
    const ada = await signIn(writer, 'session@example.com');
    const reader = authWorker(shared);
    const readSession = () =>
      get(reader, '/get-session', { cookie: ada.active });

    const response = await readSession();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: ada.user.id },
      session: { id: ada.session.id },
    });

    const signOut = await post(writer, '/sign-out', {}, { cookie: ada.active });
    expect(signOut.status).toBe(200);
    const context = await writer.auth.$context;
    expect(await context.internalAdapter.findSession(ada.token)).toBeNull();
    // Replay the token without a cookie cache: revocation is read from the DB.
    expect(await (await readSession()).json()).toBeNull();
  });
});
