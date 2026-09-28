import type { ComponentType } from 'react';

// What a Prototype plays: a video, or audio alone.
export type Media =
  | { video: { component: ComponentType; durationInFrames: number } }
  | { audio: string };

// A Prototype plays one of its options at a time, such as a speed. One with a
// single option shows no switch.
type Prototype = {
  name: string;
  idea: string;
  options: ({ label: string } & Media)[];
};

// A grid of short clips heard next to the Prototypes. Any cell can be picked.
type Audition = {
  title: string;
  rows: { name: string; note?: string }[];
  columns: string[];
  clip: (row: number, column: number) => string;
};

// A Round asks one question and answers it with rival Prototypes.
export function defineRound(round: {
  question: string;
  subject: string;
  prototypes: Prototype[];
  audition?: Audition;
}) {
  return round;
}
