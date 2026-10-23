import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { Effect } from 'effect';
import type { BinaryInfo } from '../../contract/index.js';

/** Which Claude Code to run; `path` undefined lets the SDK run its bundled one. */
export interface Executable {
  readonly path: string | undefined;
  /** No Harness Binary is configured. */
  readonly isDefault: boolean;
}

const VERSION_TIMEOUT_MS = 10_000;

const runnable = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * The Claude Code the user keeps updated: `AI_TOOLKIT_CLAUDE` or `claude` on
 * PATH. The SDK's bundled one lags behind, and refuses models newer than it.
 */
const installed = (): string | undefined =>
  [
    process.env['AI_TOOLKIT_CLAUDE'],
    ...(process.env['PATH'] ?? '')
      .split(delimiter)
      .filter((dir) => dir !== '')
      .map((dir) => join(dir, 'claude')),
  ].find((path) => path !== undefined && runnable(path));

/** The binary the SDK ships for this platform, found the way the SDK finds it. */
const bundled = (): string | undefined => {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const name = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude${exe}`;
  try {
    const require = createRequire(
      import.meta.resolve('@anthropic-ai/claude-agent-sdk'),
    );
    return require.resolve(name);
  } catch {
    return undefined;
  }
};

/** The configured Harness Binary, else the installed one, else the SDK's own. */
export const resolveExecutable = (
  configured: string | undefined,
): Executable =>
  configured === undefined
    ? { path: installed(), isDefault: true }
    : { path: configured, isDefault: false };

const reason = (
  path: string,
  error: {
    readonly code?: string | number | undefined;
    readonly message: string;
  },
): string => {
  if (error.code === 'ENOENT') return `No file at ${path}`;
  if (error.code === 'EACCES') return `${path} is not executable`;
  return `${path} --version failed: ${error.message.trim()}`;
};

/** Runs `--version` on the executable the SDK would launch. */
export const describe = (executable: Executable): Effect.Effect<BinaryInfo> => {
  const path = executable.path ?? bundled();
  if (path === undefined) {
    return Effect.succeed({
      path: null,
      version: null,
      error: 'No Claude Code found: none on PATH and no bundled binary',
      isDefault: executable.isDefault,
    });
  }
  return Effect.callback<BinaryInfo>((resume) => {
    execFile(
      path,
      ['--version'],
      { timeout: VERSION_TIMEOUT_MS },
      (error, stdout) =>
        resume(
          Effect.succeed({
            path,
            version: error === null ? stdout.trim() : null,
            error: error === null ? null : reason(path, error),
            isDefault: executable.isDefault,
          }),
        ),
    );
  });
};
