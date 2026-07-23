import { Effect } from 'effect';
import { decision, orElse, when } from 'laymos/story';

export const result = decision(
  'Route',
  { description: 'Chooses a route.' },
  route,
).pipe(
  when('ok', { description: 'Succeeds.' }, () => Effect.succeed('ok')),
  orElse({ description: 'Fails.' }, () => Effect.fail(route)),
);
