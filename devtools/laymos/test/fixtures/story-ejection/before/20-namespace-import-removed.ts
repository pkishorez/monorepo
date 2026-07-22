import { Effect } from 'effect';
import * as Narrative from 'laymos/story';

export const work = Narrative.step(
  'Work',
  { description: 'Does work.' },
  () => Effect.void,
);
