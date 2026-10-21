import { execFile, type ExecException } from 'node:child_process';
import { Effect } from 'effect';
import type { BinaryInfo, HarnessBinaries } from '../../../harness/index.js';
import { launcher } from '../app-server/index.js';

const VERSION_TIMEOUT_MS = 10_000;

const reason = (path: string, error: ExecException): string => {
  if (error.code === 'ENOENT') return `No file at ${path}`;
  if (error.code === 'EACCES') return `${path} is not executable`;
  return `${path} --version failed: ${error.message.trim()}`;
};

/** The Harness Binary Codex runs, and what its `--version` prints. */
export const binary: Effect.Effect<BinaryInfo, never, HarnessBinaries> =
  Effect.gen(function* () {
    const codex = yield* launcher;
    return yield* Effect.callback<BinaryInfo>((resume) => {
      execFile(
        codex.command,
        [...codex.args, '--version'],
        { timeout: VERSION_TIMEOUT_MS },
        (error, stdout) =>
          resume(
            Effect.succeed({
              path: codex.path,
              version: error === null ? stdout.trim() : null,
              error: error === null ? null : reason(codex.path, error),
              isDefault: codex.isDefault,
            }),
          ),
      );
    });
  });
