import { defineWalkthrough } from '../../foundation/walkthrough/index.ts';
import { beats } from './script.ts';
import { takes } from './takes.ts';
import { voiceover } from './voiceover.ts';

// Effect Oak, taught by building the Rockets demo up chapter by chapter, in
// one recording of its storyboard frame.
export const effectOak = defineWalkthrough({
  id: 'effect-oak',
  beats,
  voiceover,
  takes,
});
