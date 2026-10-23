import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';

/*
 * What an app does not ship for using auth-toolkit's Guard: neither the
 * contract (the root, used on RPC or HttpApi targets) nor the RPC server
 * half brings Effect's HttpApiBuilder, and the contract brings none of
 * rpc-toolkit's Transports. Each case bundles a small entry with Vite,
 * nothing external, importing the package by the names consumers use:
 * every `exports` entry is resolved to the source file its `dist` file is
 * built from, and rpc-toolkit is its built `dist`, as consumers get it.
 */

const root = fileURLToPath(new URL('../../../', import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(root, 'package.json'), 'utf8'),
) as {
  readonly name: string;
  readonly exports: Record<string, { readonly default: string }>;
};

const doors = Object.entries(pkg.exports).flatMap(
  ([key, { default: file }]) => {
    const source = path.join(
      root,
      file.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts'),
    );
    return existsSync(source)
      ? [
          {
            find: new RegExp(
              `^${`${pkg.name}${key.slice(1)}`.replace(/[/.-]/g, '\\$&')}$`,
            ),
            replacement: source,
          },
        ]
      : [];
  },
);

const ENTRY = '\0tree-shaking-entry.js';

const bundle = async (code: string) => {
  const entry: Plugin = {
    name: 'tree-shaking-entry',
    resolveId: (id) => (id === ENTRY ? id : undefined),
    load: (id) => (id === ENTRY ? code : undefined),
  };
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [entry],
    resolve: { alias: doors },
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: ENTRY,
        external: [],
        preserveEntrySignatures: 'strict',
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap((output) =>
    'output' in output
      ? output.output.filter((file) => file.type === 'chunk')
      : [],
  );
  const modules = chunks.flatMap((chunk) => chunk.moduleIds);
  return {
    code: chunks.map((chunk) => chunk.code).join('\n'),
    has: (fragment: string) => modules.some((id) => id.includes(fragment)),
  };
};

// Effect HttpApi's server builder, and rpc-toolkit's Transports.
const HTTP_API_BUILDER = '/effect/dist/http-api/HttpApiBuilder.';
const TRANSPORTS = [
  '/rpc-toolkit/dist/rpc/http/',
  '/rpc-toolkit/dist/rpc/websocket/',
  '/rpc-toolkit/dist/rpc/in-process/',
];

describe('what the Guard leaves out', () => {
  it('the contract, on RPC and HttpApi targets: no HttpApiBuilder, no Transport', async () => {
    const { code, has } = await bundle(
      `import { Authz } from '@kestack/auth-toolkit';
       import { Rpc, RpcGroup } from 'effect/rpc';
       import { HttpApiEndpoint } from 'effect/http-api';
       export const Group = RpcGroup.make(
         Rpc.make('Hello').pipe(Authz.required),
         Rpc.make('Write').pipe(Authz.scope('write')),
       );
       export const Hello = HttpApiEndpoint.get('hello', '/hello').pipe(
         Authz.policy(() => true, 'never'),
       );
       export const used = [Authz.User, Authz.Unauthenticated];`,
    );
    expect(code).toContain('@kestack/auth-toolkit/rpc/Auth');
    expect(code).toContain('@kestack/auth-toolkit/http-api/Auth');
    expect(has(HTTP_API_BUILDER)).toBe(false);
    for (const transport of TRANSPORTS) expect(has(transport)).toBe(false);
  }, 60_000);

  it('a Browser, signing both protocols: no HttpApiBuilder, no Transport', async () => {
    const { code, has } = await bundle(
      `import { browser } from '@kestack/auth-toolkit/client/browser';
       export const layer = browser({ url: 'https://auth.test' });`,
    );
    expect(code).toContain('@kestack/auth-toolkit/rpc/Auth');
    expect(code).toContain('@kestack/auth-toolkit/http-api/Auth');
    expect(has(HTTP_API_BUILDER)).toBe(false);
    for (const transport of TRANSPORTS) expect(has(transport)).toBe(false);
  }, 60_000);

  it('an RPC server with `server/rpc`: no HttpApiBuilder', async () => {
    const { has } = await bundle(
      `import { Authz } from '@kestack/auth-toolkit';
       import { auth } from '@kestack/auth-toolkit/server/rpc';
       import { server } from '@kestack/rpc-toolkit/rpc/http';
       import { Effect, Layer } from 'effect';
       import { Rpc, RpcGroup } from 'effect/rpc';
       const Api = RpcGroup.make(Rpc.make('Hello').pipe(Authz.required));
       const Handlers = Api.toLayer({ Hello: () => Effect.void });
       export default server(
         Api,
         Layer.mergeAll(Handlers, auth({ url: 'https://auth.test' })),
       );`,
    );
    expect(has('/rpc-toolkit/dist/rpc/http/')).toBe(true);
    expect(has(HTTP_API_BUILDER)).toBe(false);
  }, 60_000);

  it('an HttpApi server with `server/http`: no RPC Transport', async () => {
    const { has } = await bundle(
      `import { Authz } from '@kestack/auth-toolkit';
       import { auth } from '@kestack/auth-toolkit/server/http';
       import { Effect, Layer } from 'effect';
       import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
       class Api extends HttpApi.make('api').add(
         HttpApiGroup.make('hello').add(HttpApiEndpoint.get('hello', '/hello')).pipe(Authz.required),
       ) {}
       const Hello = HttpApiBuilder.group(Api, 'hello', (handlers) =>
         handlers.handle('hello', () => Effect.void),
       );
       export const App = HttpApiBuilder.layer(Api).pipe(
         Layer.provide(Hello),
         Layer.provide(auth({ url: 'https://auth.test' })),
       );`,
    );
    expect(has(HTTP_API_BUILDER)).toBe(true);
    for (const transport of TRANSPORTS) expect(has(transport)).toBe(false);
  }, 60_000);
});
