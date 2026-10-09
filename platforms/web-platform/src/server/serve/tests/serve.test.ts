import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../../../define/index.ts';
import { createServer, type LiveNamespace } from '../serve.ts';

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: async () => new Response('page') },
}));

const Group = RpcGroup.make(Rpc.make('Ping', { success: Schema.String }));

// A namespace that answers with the name it was asked for.
const objects: LiveNamespace = {
  getByName: (name) => ({
    fetch: async () => new Response(`object ${name}`),
  }),
};

const server = createServer({
  apis: { live: Api.websocket(Group, { path: '/live' }) },
  live: () => ({ live: objects }),
  auth: { url: 'https://auth.invalid' },
});

describe('a WebSocket API', () => {
  it('opens no object for a socket that carries no token', async () => {
    const response = await server.fetch(
      new Request('https://app.test/live'),
      {},
    );
    expect(response.status).toBe(401);
  });

  it('answers 503 when the sign-in service cannot be asked', async () => {
    const response = await server.fetch(
      new Request('https://app.test/live?access_token=t'),
      {},
    );
    expect(response.status).toBe(503);
  });

  it('leaves every other address to the pages', async () => {
    const response = await server.fetch(new Request('https://app.test/'), {});
    expect(await response.text()).toBe('page');
  });
});
