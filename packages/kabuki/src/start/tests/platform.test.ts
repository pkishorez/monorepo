import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloudflare, serve } from '../platform/cloudflare/index.ts';
import { nitro, serve as serve$ } from '../platform/nitro/index.ts';
import type { Handler, Host } from '../platform/index.ts';

/*
 * The adapters: what the Vite plugin builds for, and the server that hands
 * each request to Start with its env and, on Cloudflare, its Cache.
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
      from: '@kestack/kabuki/start/cloudflare',
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

describe('nitro', () => {
  it('builds for Node by its preset, and hands Nitro the preset', () => {
    const platform = nitro({ preset: 'vercel' });
    expect(platform.conditions[0]).toBe('node');
    expect(platform.config).toEqual({ nitro: { preset: 'vercel' } });
    expect(platform.serve).toEqual({
      from: '@kestack/kabuki/start/nitro',
      name: 'serve',
    });
  });

  it('builds for workerd on a Cloudflare preset', () => {
    expect(nitro({ preset: 'cloudflare_module' }).conditions[0]).toBe(
      'workerd',
    );
  });

  it('hands each request to Start with the process’s env and no Cache', async () => {
    const { hosts, handler } = recording();
    const response = await serve$(handler).fetch(
      new Request('https://site.test/'),
    );
    expect(await response.text()).toBe('drawn');
    expect(hosts).toEqual([{ env: process.env }]);
  });

  it('hands the Worker’s env and the Cache on Cloudflare', async () => {
    const cache = { match: async () => undefined, put: async () => {} };
    vi.stubGlobal('caches', { default: cache });
    const { hosts, handler } = recording();
    const env = { DB: 'binding' };
    const request = Object.assign(new Request('https://site.test/'), {
      runtime: { cloudflare: { env } },
    });
    await serve$(handler).fetch(request);
    expect(hosts).toEqual([{ env, cache }]);
  });
});
