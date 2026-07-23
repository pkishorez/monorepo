import { Effect } from 'effect';
import { flow, story, type Attributes } from 'laymos/story';

export const attributes: Attributes = {};
export const retained = story('Retained', { description: 'Retained.' });
export const work = flow(
  'Work',
  { description: 'Does work.' },
  () => Effect.void,
);
