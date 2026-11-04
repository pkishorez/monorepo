import { Console, Effect, Schema } from 'effect';
import { findOutdatedVersion } from '@kestack/std-toolkit/schema';
import { TaskV1 } from '../components/tasks.ts';

// A row the new release wrote, read by code that only knows v1.
const fromTheFuture = {
  _v: 'v2',
  taskId: 't1',
  boardId: 'work',
  title: 'Call home',
  priority: 'high',
};

export const program = Effect.gen(function* () {
  const error = yield* Schema.decodeUnknownEffect(TaskV1.schema)(
    fromTheFuture,
  ).pipe(Effect.flip);
  yield* Console.log('the read failed:', error.message);

  // Somewhere inside the failure is an OutdatedVersion. Find it.
  const outdated = findOutdatedVersion(error);
  yield* Console.log('found inside it:', {
    schema: outdated?.schema,
    version: outdated?.version,
    latestVersion: outdated?.latestVersion,
  });

  return outdated === undefined
    ? 'bad data'
    : 'this release is out of date: time to reload';
});
