import { Effect } from 'effect';
import { decision, exhaustive, step, when } from 'laymos/story';

export const result = decision(
  'Route',
  { description: 'Chooses a route.' },
  route,
).pipe(
  when('ok', { description: 'Succeeds.' }, () =>
    step('Compute', { description: 'Computes.' }, () => Effect.succeed(1)),
  ),
  when('bad', { description: 'Fails.' }, () =>
    Effect.fail(new Error('bad')),
  ),
  exhaustive,
);
