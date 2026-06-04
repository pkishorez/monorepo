import { Duration, Effect } from 'effect';

const runTask = (name: string, duration: Duration.Input = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

// [!code a:3] [!code b:2]
export default Effect.all(
  [runTask('task1'), runTask('task2'), runTask('task3')],
  { concurrency: 'unbounded' },
).pipe(Effect.withSpan('effectConcurrent'));
