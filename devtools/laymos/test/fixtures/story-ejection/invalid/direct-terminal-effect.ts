import { Effect } from 'effect';
import { terminal } from 'laymos/story';

export const result = terminal(
  'End',
  { completion: { kind: 'success' } },
  Effect.void,
);
