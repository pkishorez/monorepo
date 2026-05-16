import { Duration, Effect } from 'effect';

const runTask = (name: string, duration: Duration.DurationInput = 300) =>
  Effect.sleep(duration).pipe(Effect.withSpan(name));

// [!code a:3] [!code b:2]
export default Effect.all(
  Array.from({ length: 40 }).map((_, i) =>
    runTask(`task - ${i}`, Math.random() * 400),
  ),
  { concurrency: 4 },
).pipe(Effect.withSpan('effectConcurrent'));
