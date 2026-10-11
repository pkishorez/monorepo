// The narration, from the Walkthrough's storyboard in the docs app: the
// same beats the storyboard shows are the ones spoken here.
import { SCRIPT } from '../../../../docs/src/demos/effect-oak/showreel/script.ts';

export const beats = SCRIPT;

export const script = SCRIPT.filter((beat) => beat.say).map((beat) => ({
  id: beat.id,
  say: beat.say,
}));
