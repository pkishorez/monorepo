import { Effect } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import { fakePipeline, type Outcome, work } from './run.ts';

/*
 * The worker process of one Video, `node main.ts <id>`, started detached by
 * `create` and `resume`. It runs the Video's steps not done yet and exits:
 * 0 once done, stopped, or when another worker already runs the Video; 1
 * when a step failed. SIGTERM stops it as `ke-video stop` does.
 */

const id = process.argv[2];
if (id === undefined) {
  process.stderr.write('Usage: node main.ts <id>\n');
  process.exit(1);
}

const fake = await fakePipeline();
const run: Effect.Effect<Outcome, unknown> =
  fake === undefined
    ? work(id, await import('../pipeline/index.ts'))
    : work(id, fake);

NodeRuntime.runMain(
  run.pipe(
    Effect.tap((outcome) =>
      Effect.sync(() => process.exit(outcome === 'failed' ? 1 : 0)),
    ),
  ),
);
