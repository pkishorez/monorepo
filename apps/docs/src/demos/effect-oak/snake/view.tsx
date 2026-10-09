import { View } from 'effect-oak/react';
import { RoundView } from './round/index.js';
import { Arcade } from './snake.js';

export const ArcadeView = View.make(Arcade, ({ model, children }) => (
  <div className="flex size-full overflow-y-auto p-4">
    <div className="m-auto flex flex-col items-center gap-3">
      <h1 className="text-2xl font-semibold">Snake</h1>
      <p className="text-sm text-muted-foreground tabular-nums">
        High score: {model.highScore}
      </p>
      <RoundView node={children.round} />
    </div>
  </div>
));
