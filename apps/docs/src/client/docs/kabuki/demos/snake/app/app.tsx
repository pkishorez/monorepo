import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { Seed } from './capabilities/seed.ts';
import { BrowserKeyboard } from './browser/keyboard.ts';
import { StageLive } from './stage/stage.ts';
import { StageView } from './stage/stage-view.tsx';

// The Stage and its View, as one React component: <SnakeApp />. The Layer
// gives what the tree still needs from outside: the keys, and the seed.
export const SnakeApp = toReact(
  StageLive,
  StageView,
  Layer.mergeAll(BrowserKeyboard, Layer.succeed(Seed, { seed: 'kabuki' })),
  { name: 'demo:snake' },
);
