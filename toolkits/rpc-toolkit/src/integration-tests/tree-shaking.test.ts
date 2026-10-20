import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';

/*
 * Each Transport is its own door, so an app that uses one ships none of the
 * others. Each case bundles a small entry with Vite, nothing external,
 * importing the package by the names consumers use: every `exports` entry
 * is resolved to the source file its `dist` file is built from.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));
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
      ? [{ find: `${pkg.name}${key.slice(1)}`, replacement: source }]
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
    resolve: {
      alias: doors.map(({ find, replacement }) => ({
        find: new RegExp(`^${find.replace(/[/.-]/g, '\\$&')}$`),
        replacement,
      })),
    },
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
  return {
    code: chunks.map((chunk) => chunk.code).join('\n'),
    modules: chunks.flatMap((chunk) =>
      chunk.moduleIds.map((id) => path.relative(root, id)),
    ),
  };
};

const from = (modules: ReadonlyArray<string>, folder: string) =>
  modules.filter((id) => id.startsWith(`src/${folder}/`));

// The websocket server's own Context.Reference, there only with the server.
const WEBSOCKET_SERVER_ID = '@kestack/rpc-toolkit/InvocationKind';

describe('one door per Transport', () => {
  it('rpc/http client: no websocket, in-process or http-api code, no http server', async () => {
    const { code, modules } = await bundle(
      `import { client } from '@kestack/rpc-toolkit/rpc/http';
       export const used = client;`,
    );
    expect(from(modules, 'rpc/http')).not.toEqual([]);
    expect(from(modules, 'rpc/websocket')).toEqual([]);
    expect(from(modules, 'rpc/in-process')).toEqual([]);
    expect(from(modules, 'http-api')).toEqual([]);
    expect(code).not.toContain(WEBSOCKET_SERVER_ID);
    expect(code).not.toContain('toWebHandlerLayer');
  }, 60_000);

  it('rpc/websocket client: no websocket server, no other Transport', async () => {
    const { code, modules } = await bundle(
      `import { client, keepSubscribed } from '@kestack/rpc-toolkit/rpc/websocket';
       export const used = [client, keepSubscribed];`,
    );
    expect(from(modules, 'rpc/websocket/client')).not.toEqual([]);
    expect(from(modules, 'rpc/websocket/server')).toEqual([]);
    expect(from(modules, 'rpc/http')).toEqual([]);
    expect(from(modules, 'rpc/in-process')).toEqual([]);
    expect(code).not.toContain(WEBSOCKET_SERVER_ID);
  }, 60_000);

  it('rpc/websocket server: carries the marker the client cases look for', async () => {
    const { code, modules } = await bundle(
      `import { server } from '@kestack/rpc-toolkit/rpc/websocket';
       export const used = server;`,
    );
    expect(from(modules, 'rpc/websocket/server')).not.toEqual([]);
    expect(code).toContain(WEBSOCKET_SERVER_ID);
  }, 60_000);

  it('rpc/in-process client: no http or websocket Transport', async () => {
    const { modules } = await bundle(
      `import { client } from '@kestack/rpc-toolkit/rpc/in-process';
       export const used = client;`,
    );
    expect(from(modules, 'rpc/in-process')).not.toEqual([]);
    expect(from(modules, 'rpc/http')).toEqual([]);
    expect(from(modules, 'rpc/websocket')).toEqual([]);
  }, 60_000);

  it('rpc middleware: no Transport and no http-api middleware', async () => {
    const { modules } = await bundle(
      `import { middleware } from '@kestack/rpc-toolkit/rpc';
       export const Role = middleware()('app/Role');`,
    );
    expect(from(modules, 'rpc/middleware')).not.toEqual([]);
    expect(from(modules, 'rpc/http')).toEqual([]);
    expect(from(modules, 'rpc/websocket')).toEqual([]);
    expect(from(modules, 'rpc/in-process')).toEqual([]);
    expect(from(modules, 'http-api')).toEqual([]);
  }, 60_000);

  it('http-api middleware: no rpc code', async () => {
    const { modules } = await bundle(
      `import { middleware } from '@kestack/rpc-toolkit/http-api';
       export const Role = middleware()('app/Role');`,
    );
    expect(from(modules, 'http-api')).not.toEqual([]);
    expect(from(modules, 'rpc')).toEqual([]);
  }, 60_000);
});
