import { View } from 'effect-oak/react';
import { Ship } from '../draw/index.js';
import { Rocket } from './rocket.js';

export const RocketView = View.make(Rocket, ({ model, send }) => (
  <Ship fuel={model.fuel} onClick={() => send({ _tag: 'Fuel' })} />
));
