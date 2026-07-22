import { Effect } from 'effect';
import { decision } from 'laymos/story';

export const result = decision(
  'Route',
  { description: 'Chooses a route.' },
  () => Effect.succeed(route),
)
  .when('ok', { description: 'Succeeds.' }, (value) => Effect.succeed(value))
  .otherwise({ description: 'Fails.' }, (value) => Effect.fail(value));
