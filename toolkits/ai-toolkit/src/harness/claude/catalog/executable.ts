import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { Effect } from 'effect';
import {
  HarnessAccount,
  HarnessError,
  type BinaryInfo,
} from '../../contract/index.js';

/** The Claude Code a Harness Account runs, and the environment it runs in. */
export interface Executable {
  /** undefined when none is configured and none is installed. */
  readonly path: string | undefined;
  /** Its config folder as `CLAUDE_CONFIG_DIR`, when the account names one. */
  readonly env: NodeJS.ProcessEnv;
  /** Its config folder; undefined for Claude Code's own default. */
  readonly configFolder: string | undefined;
  /** No Harness Binary is configured. */
  readonly isDefault: boolean;
}

/** What to do when no Claude Code is installed. */
export const INSTALL_CLAUDE =
  'Claude Code is not installed: install it from https://claude.com/claude-code, then run `claude auth login`';

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
 * Where Claude Code sits in one PATH folder. On Windows npm puts a
 * `claude.cmd` there, which Node cannot start without a shell, so the
 * `claude.exe` that npm's package holds is run instead.
 */
const inFolder = (dir: string): ReadonlyArray<string> =>
  process.platform === 'win32'
    ? [
        join(dir, 'claude.exe'),
        join(
          dir,
          'node_modules',
          '@anthropic-ai',
          'claude-code',
          'bin',
          'claude.exe',
        ),
      ]
    : [join(dir, 'claude')];

/**
 * The Claude Code the user keeps updated: `AI_TOOLKIT_CLAUDE` or `claude`
 * on PATH. This package ships none of its own.
 */
const installed = (): string | undefined =>
  [
    process.env['AI_TOOLKIT_CLAUDE'],
    ...(process.env['PATH'] ?? '')
      .split(delimiter)
      .filter((dir) => dir !== '')
      .flatMap(inFolder),
  ].find((path) => path !== undefined && runnable(path));

/** The Harness Account's Claude Code: its binary, else the installed one. */
export const current: Effect.Effect<Executable, never, HarnessAccount> =
  Effect.map(HarnessAccount, (account) => ({
    path: account.binary ?? installed(),
    env:
      account.configFolder === undefined
        ? process.env
        : { ...process.env, CLAUDE_CONFIG_DIR: account.configFolder },
    configFolder: account.configFolder,
    isDefault: account.binary === undefined,
  }));

/** The Claude Code to launch, read every time a process starts. */
export const executable: Effect.Effect<
  Executable & { readonly path: string },
  HarnessError,
  HarnessAccount
> = Effect.flatMap(current, (found) =>
  found.path === undefined
    ? Effect.fail(new HarnessError({ message: INSTALL_CLAUDE }))
    : Effect.succeed({ ...found, path: found.path }),
);

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

/** Runs `--version` on the executable a call would launch. */
export const describe = (executable: Executable): Effect.Effect<BinaryInfo> => {
  const path = executable.path;
  if (path === undefined) {
    return Effect.succeed({
      path: null,
      version: null,
      error: INSTALL_CLAUDE,
      isDefault: executable.isDefault,
    });
  }
  return Effect.callback<BinaryInfo>((resume) => {
    execFile(
      path,
      ['--version'],
      { timeout: VERSION_TIMEOUT_MS, env: executable.env },
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
