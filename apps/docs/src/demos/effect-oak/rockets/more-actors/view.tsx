import { View } from 'effect-oak/react';
import {
  Bay,
  Berth,
  Berths,
  Button,
  Gauge,
  Pod,
  Ship,
  Stage,
  Toolbar,
} from '../look/index.js';
import { Booster } from './booster.js';
import { LaunchSite } from './launch-site.js';
import { Rocket } from './rocket.js';

export const BoosterView = View.make(Booster, {
  Firing: () => <Pod firing />,
  Spent: () => null,
});

export const RocketView = View.make(Rocket, {
  OnPad: ({ model, send }) => (
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
  ),
  InFlight: ({ model, children, send }) => (
    <Bay
      phase="flight"
      status="In flight"
      gauge={<Gauge fuel={model.fuel} />}
      sky={
        <Ship
          phase="flight"
          boosters={children.boosters.map((booster) => (
            <BoosterView key={booster.id} node={booster} />
          ))}
        />
      }
    >
      <Button tone="go" onClick={() => send({ _tag: 'Land' })}>
        Land
      </Button>
    </Bay>
  ),
  Landed: ({ model, send }) => (
    <Bay
      phase="landed"
      status="Landed"
      gauge={<Gauge fuel={model.fuel} />}
      pad={<Ship phase="landed" />}
    >
      <Button onClick={() => send({ _tag: 'Reset' })}>Reset</Button>
    </Bay>
  ),
  Lost: ({ model, send }) => (
    <Bay
      phase="lost"
      status="Lost"
      gauge={<Gauge fuel={model.fuel} />}
      sky={<Ship phase="lost" />}
    >
      <Button onClick={() => send({ _tag: 'Reset' })}>Reset</Button>
    </Bay>
  ),
});

export const LaunchSiteView = View.make(
  LaunchSite,
  ({ model, children, send }) => (
    <Stage>
      <Toolbar>
        <Button onClick={() => send({ _tag: 'Built' })}>Build</Button>
      </Toolbar>
      <Berths>
        {children.rockets.map((rocket, index) => (
          <Berth key={rocket.id} name={model.rockets[index]!}>
            <RocketView node={rocket} />
          </Berth>
        ))}
      </Berths>
    </Stage>
  ),
);
