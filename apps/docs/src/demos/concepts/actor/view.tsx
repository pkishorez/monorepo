import { View } from 'effect-oak/react';
import { Chip, Chips, Circle } from '../shapes/index.js';
import { Counter } from './actor.js';

/** The Counter as one Circle with its count inside; clicking it Sends Increment. */
export const CounterView = View.make(Counter, ({ id, model, send }) => (
  <>
    <Circle id={id} pulse={model} onClick={() => send({ _tag: 'Increment' })}>
      {model.count}
    </Circle>
    <Chips>
      <Chip onClick={() => send({ _tag: 'Decrement' })}>Decrement</Chip>
      <Chip onClick={() => send({ _tag: 'Reset' })}>Reset</Chip>
    </Chips>
  </>
));
