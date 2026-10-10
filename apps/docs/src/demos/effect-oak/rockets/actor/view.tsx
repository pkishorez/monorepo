import { View } from 'effect-oak/react';
import { Bay, Button, Gauge, Ship, Stage } from '../look/index.js';
import { Rocket } from './rocket.js';

export const RocketView = View.make(Rocket, ({ model, send }) => (
  <Stage>
    <Bay
      phase="pad"
      gauge={<Gauge fuel={model.fuel} />}
      pad={<Ship phase="pad" />}
    >
      <Button onClick={() => send({ _tag: 'Fuel' })}>Fuel</Button>
      <Button onClick={() => send({ _tag: 'Drain' })}>Drain</Button>
    </Bay>
  </Stage>
));
