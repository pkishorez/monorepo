import { Effect } from 'effect';
import * as Narrative from 'laymos/story';

export const group = Narrative.storyGroup('Group', {
  description: 'A group.',
});
export const work = Narrative.flow(
  'Work',
  { description: 'Works.' },
  () =>
    Narrative.step('Step', { description: 'Steps.' }, () => Effect.void),
);
