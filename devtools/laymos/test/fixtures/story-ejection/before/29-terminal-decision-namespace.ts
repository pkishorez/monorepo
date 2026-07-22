import { Effect } from 'effect';
import * as Story from 'laymos/story';

export const result = Story.decision(
  'Choice',
  { description: 'Chooses whether this branch ends.' },
  true,
)
  .when(true, { description: 'Ends the selected branch.' }, () =>
    Story.terminal(
      'End',
      { description: 'Ends.', completion: { kind: 'success' } },
      () => Effect.succeed('done'),
    ),
  )
  .exhaustive();
