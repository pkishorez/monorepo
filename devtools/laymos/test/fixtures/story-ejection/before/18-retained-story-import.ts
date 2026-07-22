import { Effect } from 'effect';
import { flow, storyGroup, type Attributes } from 'laymos/story';

export const attributes: Attributes = {};
export const group = storyGroup('Group', { description: 'A group.' });
export const work = flow(
  'Work',
  { description: 'Does work.' },
  () => Effect.void,
);
