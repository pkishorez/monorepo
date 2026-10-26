import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

/** Where a Coding Harness ran when it failed. */
export interface FailedIn {
  /** The Coding Harness as a person names it, such as `Claude Code`. */
  readonly harness: string;
  readonly cwd: string;
  /** The Harness Binary it ran as. */
  readonly binary: string;
}

/** A reason longer than this is cut, so it reads as one line. */
const MAX_CHARS = 300;

const NOT_LOGGED_IN =
  /not logged in|\/login|invalid api key|authenticat|unauthori[sz]ed|\b401\b|oauth token/i;
const RATE_LIMITED = /rate.?limit|usage limit|too many requests|\b429\b/i;

const field = (cause: unknown, key: string): unknown =>
  typeof cause === 'object' && cause !== null && key in cause
    ? (cause as Record<string, unknown>)[key]
    : undefined;

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const short = (value: string): string => {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length <= MAX_CHARS ? line : `${line.slice(0, MAX_CHARS - 1)}…`;
};

const lastLine = (value: string): string =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .at(-1) ?? '';

const then = (detail: string) => (detail === '' ? '' : `: ${short(detail)}`);

/**
 * Why a Coding Harness failed, as a person reads it: a missing project
 * folder, a Harness Binary that is missing or cannot run, a lost login, a
 * rate limit, or the process's exit with the last line it wrote to stderr;
 * else what the harness said. The cause is an Error from its SDK or
 * process, or `{ exitCode, signal, stderr }`.
 */
export const failureReason = (cause: unknown, where: FailedIn): string => {
  const { harness, cwd, binary } = where;
  // Starting in a missing folder fails as though the binary were missing.
  if (!existsSync(cwd)) return `The project folder ${cwd} no longer exists`;
  const code = field(cause, 'code');
  if (code === 'EACCES')
    return `${harness} at ${binary} cannot be run: it is not executable`;
  if (code === 'ENOENT' && !existsSync(binary))
    return isAbsolute(binary)
      ? `${harness} was not found at ${binary}`
      : `${harness} (${binary}) was not found on PATH`;
  if (field(cause, 'errorClass') === 'executable_launch_failed')
    return `${harness} at ${binary} could not be started`;

  // Claude Code's SDK puts the stderr tail in the message.
  const [head = '', tail = ''] =
    typeof cause === 'string'
      ? [cause]
      : text(field(cause, 'message')).split('. stderr: ');
  const said = lastLine(text(field(cause, 'stderr')) || tail);
  const detail = said || head;
  if (NOT_LOGGED_IN.test(`${head}\n${said}`))
    return `${harness} is not logged in${then(detail)}`;
  if (RATE_LIMITED.test(`${head}\n${said}`))
    return `${harness} hit a rate limit${then(detail)}`;
  const exitCode =
    field(cause, 'exitCode') ?? /exited with code (-?\d+)/.exec(head)?.[1];
  if (exitCode !== undefined && exitCode !== null)
    return `${harness} stopped with exit code ${String(exitCode)}${then(said)}`;
  const signal = field(cause, 'signal') ?? /by signal (\w+)/.exec(head)?.[1];
  if (typeof signal === 'string')
    return `${harness} was stopped by ${signal}${then(said)}`;
  return short(head) || `${harness} stopped without saying why`;
};
