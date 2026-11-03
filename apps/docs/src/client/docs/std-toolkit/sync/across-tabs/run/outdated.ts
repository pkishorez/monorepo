import { Console, Effect, Schema } from 'effect';
import {
  EntityESchema,
  findOutdatedVersion,
} from '@kestack/std-toolkit/eschema';

const fields = { boardId: Schema.String, title: Schema.String };
const withPriority = EntityESchema.make('Task', 'taskId', fields).evolve(
  'v2',
  { priority: Schema.Literals(['low', 'high']) },
  (v1) => ({ ...v1, priority: 'low' as const }),
);

// The tab still open runs release 2. The release you just shipped adds done.
const TaskInOldTab = withPriority.build();
const TaskShipped = withPriority
  .evolve('v3', { done: Schema.Boolean }, (v2) => ({ ...v2, done: false }))
  .build();

export const program = Effect.gen(function* () {
  // A tab on the new release saves a task: it is stored at v3.
  const stored = yield* Schema.encodeEffect(TaskShipped.schema)({
    boardId: 'work',
    taskId: 't1',
    title: 'Call home',
    priority: 'high',
    done: true,
  });
  yield* Console.log('saved by the new release', stored);

  // The old tab reads it. It knows v1 and v2, not v3.
  const failure = yield* Schema.decodeUnknownEffect(TaskInOldTab.schema)(
    stored,
  ).pipe(Effect.flip);
  const outdated = findOutdatedVersion(failure);
  yield* Console.log(
    'the old tab finds an OutdatedVersion',
    outdated && {
      schema: outdated.schema,
      met: outdated.version,
      knowsUpTo: outdated.latestVersion,
    },
  );

  // Not bad data: this tab is out of date. Sync skips the task, says so
  // once, and waits for a reload.
  return outdated ? 'Outdated Application: reload to read it' : 'bad data';
});
