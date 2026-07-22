import { Effect } from 'effect';
import { flow as narrate, step as action } from 'laymos/story';

export const load = narrate(
  'Load',
  { description: 'Loads a value.' },
  (id: string) =>
    action('Read', { description: 'Reads it.' }, () => Effect.succeed(id)),
);
