import { Effect } from 'effect';
import * as Narrative from 'laymos/story';

export const retained = Narrative.story('Retained', {
  description: 'Retained.',
});
export const work = Narrative.flow(
  'Work',
  { description: 'Works.' },
  () => Narrative.step('Step', { description: 'Steps.' }, () => Effect.void),
);
