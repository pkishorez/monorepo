import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/*
 * The one door to the CLI: `node bin/ke-video.mjs <command> --json`. A
 * command either answers its JSON on stdout, or exits 1 with one plain line
 * on stderr, which is what the user is shown.
 */

const BIN = fileURLToPath(
  new URL('../../../../bin/ke-video.mjs', import.meta.url),
);

export type Answer =
  | { readonly ok: true; readonly json: unknown }
  | { readonly ok: false; readonly error: string };

const spawnCli = (args: ReadonlyArray<string>): ChildProcess =>
  spawn(process.execPath, [BIN, ...args, '--json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

/** The last line the CLI wrote on stderr, or what became of it. */
const lastLine = (text: string, code: number | null) =>
  text.trim().split('\n').at(-1)?.trim() ||
  `ke-video exited with ${code ?? 'a signal'}`;

/** Runs one command to its end. */
export const run = (args: ReadonlyArray<string>): Promise<Answer> =>
  new Promise((resolve) => {
    const child = spawnCli(args);
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr?.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) =>
      resolve({ ok: false, error: `Could not run ke-video: ${error.message}` }),
    );
    child.once('close', (code) => {
      if (code !== 0)
        return resolve({ ok: false, error: lastLine(stderr, code) });
      try {
        resolve({ ok: true, json: JSON.parse(stdout) });
      } catch {
        resolve({ ok: false, error: `ke-video ${args[0]} printed no JSON` });
      }
    });
  });

/** Starts a command that keeps printing, as `logs <id> -f`; the caller kills it. */
export const follow = (args: ReadonlyArray<string>): ChildProcess =>
  spawnCli(args);
