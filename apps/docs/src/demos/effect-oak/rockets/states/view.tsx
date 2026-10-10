import { View } from 'effect-oak/react';
import { Bay, Button, Gauge, Ship, Stage } from '../look/index.js';
import { Rocket } from './rocket.js';

export const RocketView = View.make(Rocket, {
  OnPad: ({ model, send }) => (
    <Stage>
      <Bay
        phase="pad"
        status="On pad"
        gauge={<Gauge fuel={model.fuel} />}
        pad={<Ship phase="pad" />}
      >
        <Button onClick={() => send({ _tag: 'Fuel' })}>Fuel</Button>
        <Button onClick={() => send({ _tag: 'Drain' })}>Drain</Button>
        <Button tone="go" onClick={() => send({ _tag: 'Launch' })}>
          Launch
        </Button>
      </Bay>
    </Stage>
  ),
  InFlight: ({ model, send }) => (
    <Stage>
      <Bay
        phase="flight"
        status="In flight"
        gauge={<Gauge fuel={model.fuel} />}
        sky={<Ship phase="flight" />}
      >
        <Button tone="go" onClick={() => send({ _tag: 'Land' })}>
          Land
        </Button>
      </Bay>
    </Stage>
  ),
  Landed: ({ model, send }) => (
    <Stage>
      <Bay
        phase="landed"
        status="Landed"
        gauge={<Gauge fuel={model.fuel} />}
        pad={<Ship phase="landed" />}
      >
        <Button onClick={() => send({ _tag: 'Reset' })}>Reset</Button>
      </Bay>
    </Stage>
  ),
  Lost: ({ model, send }) => (
    <Stage>
      <Bay
        phase="lost"
        status="Lost"
        gauge={<Gauge fuel={model.fuel} />}
        sky={<Ship phase="lost" />}
      >
        <Button onClick={() => send({ _tag: 'Reset' })}>Reset</Button>
      </Bay>
    </Stage>
  ),
});
