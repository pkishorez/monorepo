import { Duration, Effect } from 'effect';

const runTask = (
  name: string,
  duration: Duration.DurationInput = 300,
  status: 'succeed' | 'fail' = 'succeed',
) =>
  Effect.sleep(duration).pipe(
    Effect.andThen(
      status === 'succeed' ? Effect.void : Effect.fail(new Error('fail')),
    ),
    Effect.withSpan(name),
  );

export default Effect.all([
  runTask('task1'),
  runTask('task2'),
  runTask('task3', 300, 'fail'),
  runTask('task4'),
  runTask('task5'),
]).pipe(Effect.withSpan('fail-fast'));
