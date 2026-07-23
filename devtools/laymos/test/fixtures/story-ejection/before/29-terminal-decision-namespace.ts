import { Effect } from 'effect';
import { decision, exhaustive, terminal, when } from 'laymos/story';

export const result = decision(
  'Choice',
  { description: 'Chooses whether this branch ends.' },
  true,
).pipe(
  when(true, { description: 'Ends the selected branch.' }, () =>
    terminal(
      'End',
      { description: 'Ends.', completion: { kind: 'success' } },
      () => Effect.succeed('done'),
    ),
  ),
  exhaustive,
);
