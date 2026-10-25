import { accessSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { Effect } from 'effect';
import { HarnessAccount } from '../../contract/index.js';

/** How to run Codex: a command, the arguments before Codex's own, and its environment. */
export interface Launcher {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  /** The executable a person would name: the configured path, or the one found. */
  readonly path: string;
  readonly env: NodeJS.ProcessEnv;
  /** No Harness Binary is configured: the user's own `codex` runs. */
  readonly isDefault: boolean;
}

const exists = (path: string) => {
  try {
    accessSync(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * The user's own Codex on PATH. Elsewhere `codex` is found as it runs. On
 * Windows npm puts a `codex.cmd` on PATH, which Node cannot start without
 * a shell, so the `bin/codex.js` npm's package holds runs under this Node;
 * a `codex.exe` runs as it is.
 */
const installed = (): Pick<Launcher, 'command' | 'args' | 'path'> => {
  if (process.platform === 'win32')
    for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
      if (dir === '') continue;
      const exe = join(dir, 'codex.exe');
      if (exists(exe)) return { command: exe, args: [], path: exe };
      const entry = join(
        dir,
        'node_modules',
        '@openai',
        'codex',
        'bin',
        'codex.js',
      );
      if (exists(entry))
        return { command: process.execPath, args: [entry], path: entry };
    }
  return { command: 'codex', args: [], path: 'codex' };
};

/**
 * The Harness Account's Codex: its binary, else the user's own from PATH,
 * never one shipped with this package; its config folder as `CODEX_HOME`.
 */
export const launcher: Effect.Effect<Launcher, never, HarnessAccount> =
  Effect.map(HarnessAccount, (account) => ({
    ...(account.binary === undefined
      ? installed()
      : { command: account.binary, args: [], path: account.binary }),
    env:
      account.configFolder === undefined
        ? process.env
        : { ...process.env, CODEX_HOME: account.configFolder },
    isDefault: account.binary === undefined,
  }));
