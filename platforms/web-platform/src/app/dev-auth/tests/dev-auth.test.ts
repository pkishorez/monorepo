import { build, type Plugin } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { backendsOf, isFakeAuth, noFakeAuth } from '../index.ts';

const ENTRY = '\0dev-auth-entry.js';

/** Builds `code` as an app would, with `noFakeAuth` among its plugins. */
const bundle = (code: string) => {
  const entry: Plugin = {
    name: 'dev-auth-entry',
    resolveId: (id) => (id === ENTRY ? id : undefined),
    load: (id) => (id === ENTRY ? code : undefined),
  };
  return build({
    configFile: false,
    logLevel: 'silent',
    plugins: [entry, noFakeAuth() as Plugin],
    build: { write: false, rollupOptions: { input: ENTRY } },
  });
};

describe('noFakeAuth', () => {
  it('fails a build that carries the Fake', async () => {
    await expect(
      bundle(`console.warn('kestack-fake-auth: anyone may sign in');`),
    ).rejects.toThrow(/carries auth-toolkit's Fake/);
  }, 60_000);

  it('lets a build without it through', async () => {
    await expect(bundle(`console.log('signed in');`)).resolves.toBeDefined();
  }, 60_000);
});

describe('isFakeAuth', () => {
  const was = process.env['KESTACK_AUTH'];
  afterEach(() => {
    if (was === undefined) delete process.env['KESTACK_AUTH'];
    else process.env['KESTACK_AUTH'] = was;
  });

  it('is the Fake in development, unless KESTACK_AUTH=real, and never elsewhere', () => {
    delete process.env['KESTACK_AUTH'];
    expect(isFakeAuth(true)).toBe(true);
    expect(isFakeAuth(false)).toBe(false);
    process.env['KESTACK_AUTH'] = 'real';
    expect(isFakeAuth(true)).toBe(false);
  });
});

describe('backendsOf', () => {
  it('puts every backend URL but auth on the site, at /rpc-<name>', () => {
    expect(
      backendsOf({
        'import.meta.env.VITE_AUTH_URL': '"https://auth.kishore.computer"',
        'import.meta.env.VITE_CONNECT_URL':
          '"https://connect.kishore.computer"',
        'import.meta.env.VITE_HELLO_RPC_URL': '"http://localhost:4582"',
        'import.meta.env.VITE_TITLE': '"Code"',
        'import.meta.env.VITE_DOCS_URL': '"/docs"',
      }),
    ).toEqual([
      {
        key: 'import.meta.env.VITE_CONNECT_URL',
        path: '/rpc-connect',
        target: 'https://connect.kishore.computer',
      },
      {
        key: 'import.meta.env.VITE_HELLO_RPC_URL',
        path: '/rpc-hello-rpc',
        target: 'http://localhost:4582',
      },
    ]);
  });
});
