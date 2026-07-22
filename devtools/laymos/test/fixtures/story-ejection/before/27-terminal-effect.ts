import { Effect } from 'effect';
import { terminal } from 'laymos/story';

export const result = terminal(
  'Already built ending',
  {
    description: 'Uses an existing Effect as a documented ending.',
    completion: { kind: 'success' },
  },
  Effect.void,
);
