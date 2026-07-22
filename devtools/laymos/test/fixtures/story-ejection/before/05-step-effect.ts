import { Effect } from 'effect';
import { step } from 'laymos/story';

export const result = step(
  'Already built',
  { description: 'Uses an existing Effect.' },
  Effect.void,
);
