import { Effect } from 'effect';
import { terminal as end } from 'laymos/story';

export const result = end(
  'Deferred ending',
  {
    description: 'Defers construction of the documented ending.',
    completion: { kind: 'error', error: 'Stopped' },
  },
  () => Effect.void,
);
