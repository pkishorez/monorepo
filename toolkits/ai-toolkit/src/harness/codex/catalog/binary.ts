import { execFile, type ExecException } from 'node:child_process';
import { Effect } from 'effect';
import type { BinaryInfo, HarnessAccount } from '../../contract/index.js';
import { launcher } from '../app-server/index.js';

const VERSION_TIMEOUT_MS = 10_000;

/** What to do when no `codex` is on PATH. */
export const INSTALL_CODEX =
  'Codex is not installed: install it with `npm install -g @openai/codex`, then run `codex login`';

const reason = (
  path: string,
  isDefault: boolean,
  error: ExecException,
): string => {
  if (error.code === 'ENOENT')
    return isDefault ? INSTALL_CODEX : `No file at ${path}`;
  if (error.code === 'EACCES') return `${path} is not executable`;
  return `${path} --version failed: ${error.message.trim()}`;
};

/** The Harness Binary Codex runs, and what its `--version` prints. */
export const binary: Effect.Effect<BinaryInfo, never, HarnessAccount> =
  Effect.gen(function* () {
    const codex = yield* launcher;
    return yield* Effect.callback<BinaryInfo>((resume) => {
      execFile(
        codex.command,
        ['--version'],
        { timeout: VERSION_TIMEOUT_MS, env: codex.env },
        (error, stdout) =>
          resume(
            Effect.succeed({
              path: codex.command,
              version: error === null ? stdout.trim() : null,
              error:
                error === null
                  ? null
                  : reason(codex.command, codex.isDefault, error),
              isDefault: codex.isDefault,
            }),
          ),
      );
    });
  });
