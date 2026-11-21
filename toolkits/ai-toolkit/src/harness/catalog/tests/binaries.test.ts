import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  binaryAt,
  HarnessAccount,
  HarnessHost,
  type Harness,
} from '../../contract/index.js';
import { checkBinary, configFolderOf, harnessHostLayer } from '../index.js';

const folder = mkdtempSync(join(tmpdir(), 'ai-toolkit-binaries-'));
/** A harness whose binary runs wherever it is set. */
const harness = {
  binary: Effect.map(
    Effect.map(HarnessAccount, (account) => account.binary),
    (path) => ({
      path: path ?? '/usr/local/bin/claude',
      version: '1.0.0',
      error: null,
      isDefault: path === undefined,
    }),
  ),
} as unknown as Harness;

const whyNot = (path: string) =>
  Effect.runPromise(
    Effect.map(Effect.flip(checkBinary(harness, path)), (e) => e.message),
  );

describe('Harness Binaries', () => {
  it('reads a harness binary at a path, or its default', async () => {
    const installed = await Effect.runPromise(
      binaryAt(harness, { binary: undefined, configFolder: undefined }),
    );
    expect(installed.isDefault).toBe(true);
    const at = await Effect.runPromise(
      binaryAt(harness, { binary: '/x/claude', configFolder: undefined }),
    );
    expect(at.isDefault).toBe(false);
  });

  it('takes a path only once it runs', async () => {
    expect(await whyNot('/no/such/binary')).toBe(
      'Nothing is at /no/such/binary',
    );
    const plain = join(folder, 'plain');
    writeFileSync(plain, 'not a program');
    expect(await whyNot(plain)).toBe(`${plain} is not executable`);

    const good = join(folder, 'claude');
    writeFileSync(good, '#!/bin/sh\necho fake\n');
    chmodSync(good, 0o755);
    expect(await Effect.runPromise(checkBinary(harness, ` ${good} `))).toBe(
      good,
    );
  });
});

describe('the Harness Host on this computer', () => {
  it('runs binaries and reads the config folder as the functions do', async () => {
    const [missing, info, folder] = await Effect.runPromise(
      Effect.gen(function* () {
        const host = yield* HarnessHost;
        return [
          yield* Effect.flip(host.checkBinary(harness, '/no/such/binary')),
          yield* host.binaryAt(harness, {
            binary: '/x/claude',
            configFolder: undefined,
          }),
          yield* host.configFolderOf('claude', '/home/me/.claude-work'),
        ] as const;
      }).pipe(Effect.provide(harnessHostLayer)),
    );
    expect(missing.message).toBe('Nothing is at /no/such/binary');
    expect(info.path).toBe('/x/claude');
    expect(folder).toEqual({ path: '/home/me/.claude-work', from: 'account' });
  });
});

/*
 * The config folder a Harness Account really uses: its own when it has
 * one; else the harness's variable in the environment it runs in; else
 * the harness's own folder under home.
 */

const home = '/home/me';

describe('the config folder used', () => {
  it("is the account's own folder first, whatever the environment says", () => {
    expect(
      configFolderOf(
        'claude',
        '/home/me/.claude-personal',
        { CLAUDE_CONFIG_DIR: '/home/me/.claude-work' },
        home,
      ),
    ).toEqual({ path: '/home/me/.claude-personal', from: 'account' });
  });

  it('is the variable set in the environment for an account with none', () => {
    expect(
      configFolderOf(
        'claude',
        undefined,
        { CLAUDE_CONFIG_DIR: '/home/me/.claude-work' },
        home,
      ),
    ).toEqual({
      path: '/home/me/.claude-work',
      from: 'environment',
      variable: 'CLAUDE_CONFIG_DIR',
    });
    expect(
      configFolderOf('codex', undefined, { CODEX_HOME: '/srv/codex' }, home),
    ).toEqual({
      path: '/srv/codex',
      from: 'environment',
      variable: 'CODEX_HOME',
    });
  });

  it("is the harness's own folder under home with neither", () => {
    expect(configFolderOf('claude', undefined, {}, home)).toEqual({
      path: '/home/me/.claude',
      from: 'default',
    });
    expect(
      configFolderOf('codex', undefined, { CODEX_HOME: '  ' }, home),
    ).toEqual({ path: '/home/me/.codex', from: 'default' });
  });

  it("reads another harness's variable as nothing", () => {
    expect(
      configFolderOf('codex', undefined, { CLAUDE_CONFIG_DIR: '/x' }, home),
    ).toEqual({ path: '/home/me/.codex', from: 'default' });
  });
});
