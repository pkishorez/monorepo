import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import { serve } from '../serve/index.js';
import { branchOf } from './branch.js';

export { branchOf };

/*
 * Connect in development, in the foreground: this branch's Cloud Connect
 * under `alchemy dev`, behind Portless, and a Machine of this branch's own
 * serving against it, until Ctrl-C stops both.
 */

/** How long to wait for Cloud Connect to answer, between tries. */
const RETRY_MS = 500;

/** Waits until `GET <cloud>/auth` answers 200, or `child` exits. */
const answering = (cloud: string, exited: () => boolean) =>
  Effect.promise(async () => {
    while (!exited()) {
      try {
        const response = await fetch(`${cloud.replace(/\/+$/, '')}/auth`);
        await response.body?.cancel();
        if (response.ok) return true;
      } catch {
        // Not up yet.
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
    return false;
  });

/**
 * Runs this branch's Cloud Connect and Machine until Ctrl-C. It runs only
 * in the monorepo, where the package has its `alchemy.run.ts`.
 */
export const runConnectDev = async (): Promise<void> => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  if (!existsSync(join(root, 'alchemy.run.ts')))
    throw new Error('runConnectDev runs only in the monorepo');
  const { slug, cloud } = await branchOf(root);

  const program = Effect.gen(function* () {
    let exited = false;
    const alchemy = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const child = spawn('portless', ['run', '--force', 'alchemy', 'dev'], {
          cwd: root,
          stdio: 'inherit',
        });
        child.once('exit', () => void (exited = true));
        return child;
      }),
      (child) =>
        Effect.sync(() => {
          if (!exited) child.kill('SIGINT');
        }),
    );
    yield* Effect.log(`Waiting for Cloud Connect at ${cloud}`);
    if (!(yield* answering(cloud, () => exited)))
      return yield* Effect.fail(
        new Error(`alchemy dev exited with ${alchemy.exitCode}`),
      );
    yield* serve({ cloud, branch: slug, port: 0 });
  }).pipe(Effect.scoped);

  NodeRuntime.runMain(program);
};
