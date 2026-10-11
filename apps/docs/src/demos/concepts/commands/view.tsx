import { View } from 'effect-oak/react';
import { Circle } from '../shapes/index.js';
import { Dice } from './commands.js';

/** The Dice as one Circle with its face inside; clicking it Sends Roll, and the Path to the Edge shows while the roll Command runs. */
export const DiceView = View.make(Dice, ({ id, model, send }) => (
  <Circle
    id={id}
    pulse={model}
    onClick={() => send({ _tag: 'Roll' })}
    path={model.rolling ? 'roll' : undefined}
  >
    {model.value}
  </Circle>
));
