import { Effect } from 'effect';
import { HarnessAccount } from '../../contract/index.js';

/** How to run Codex: the command, and the environment it runs in. */
export interface Launcher {
  /** The configured path, or `codex` for the one on PATH. */
  readonly command: string;
  readonly env: NodeJS.ProcessEnv;
  /** No Harness Binary is configured: `codex` from PATH runs. */
  readonly isDefault: boolean;
}

/**
 * The Harness Account's Codex: its binary, else the user's own `codex` from
 * PATH, never one shipped with this package; its config folder as
 * `CODEX_HOME`.
 */
export const launcher: Effect.Effect<Launcher, never, HarnessAccount> =
  Effect.map(HarnessAccount, (account) => ({
    command: account.binary ?? 'codex',
    env:
      account.configFolder === undefined
        ? process.env
        : { ...process.env, CODEX_HOME: account.configFolder },
    isDefault: account.binary === undefined,
  }));
