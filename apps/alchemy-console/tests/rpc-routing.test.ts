import { HttpClientRequest } from 'effect/unstable/http';
import { expect, it, vi } from 'vite-plus/test';

const { rpc, page } = vi.hoisted(() => ({
  rpc: vi.fn(async () => Response.json({ ok: true })),
  page: vi.fn(async () => new Response('page')),
}));
vi.mock('../src/server/host/rpc-host/index.ts', () => ({ handleRpc: rpc }));
vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: page },
}));
import server from '../src/server.ts';

it('routes the URL produced by the Effect RPC HTTP client to RPC, including its trailing slash', async () => {
  const request = HttpClientRequest.post('').pipe(
    HttpClientRequest.prependUrl('https://console.example/rpc'),
  );
  const env = { DB: {} } as Parameters<typeof server.fetch>[1];
  for (const url of [request.url, 'https://console.example/rpc']) {
    const response = await server.fetch(
      new Request(url, { method: 'POST' }) as Parameters<
        typeof server.fetch
      >[0],
      env,
    );
    expect(await response.json()).toEqual({ ok: true });
  }
  expect(page).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledTimes(2);
  await server.fetch(
    new Request('https://console.example/stores/demo') as Parameters<
      typeof server.fetch
    >[0],
    env,
  );
  expect(page).toHaveBeenCalledTimes(1);
});
