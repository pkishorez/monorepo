import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudflare, serve } from '../platform/cloudflare/index.ts';
import type { Handler, Host } from '../platform/index.ts';

/*
 * The Cloudflare adapter: what the Vite plugin builds for, and the Worker
 * that hands each request to Start with its env and the Cloudflare Cache.
 */

const recording = () => {
  const hosts: Array<Host> = [];
  const handler: Handler = {
    fetch: async (_request, host) => {
      hosts.push(host);
      return new Response('drawn');
    },
  };
  return { hosts, handler };
};

afterEach(() => vi.unstubAllGlobals());

describe('cloudflare', () => {
  it('builds for workerd, and wraps the handler in its own serve', () => {
    const platform = cloudflare();
    expect(platform.conditions[0]).toBe('workerd');
    expect(platform.serve).toEqual({
      from: '@kestack/kabuki/start/platform/cloudflare',
      name: 'serve',
    });
  });

  it('hands each request to Start with the Worker’s env and the Cache', async () => {
    const cache = { match: async () => undefined, put: async () => {} };
    vi.stubGlobal('caches', { default: cache });
    const { hosts, handler } = recording();
    const env = { DB: 'binding' };
    const response = await serve(handler).fetch(
      new Request('https://site.test/'),
      env,
    );
    expect(await response.text()).toBe('drawn');
    expect(hosts).toEqual([{ env, cache }]);
  });

  it('hands no Cache where there is none, as in Node', async () => {
    const { hosts, handler } = recording();
    await serve(handler).fetch(new Request('https://site.test/'), {});
    expect(hosts).toEqual([{ env: {} }]);
  });
});
