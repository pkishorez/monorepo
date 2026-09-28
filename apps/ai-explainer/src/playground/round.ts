import type { ComponentType } from 'react';

type Prototype = {
  name: string;
  idea: string;
  video: { component: ComponentType; durationInFrames: number };
};

// A Round asks one question and answers it with rival Prototypes.
export function defineRound(round: {
  question: string;
  subject: string;
  prototypes: Prototype[];
}) {
  return round;
}
