import { View } from 'effect-oak/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bay,
  Berth,
  Berths,
  Button,
  Gauge,
  Ship,
  Stage,
  Toolbar,
} from '../look/index.js';
import { BoosterView } from '../motion/index.js';
import { LaunchSite } from './launch-site.js';
import { Rocket } from './rocket.js';

export const RocketView = View.make(Rocket, {
  OnPad: ({ id, model, send }) => (
    <Bay
      phase="pad"
      status={model.scrubbed ? 'Scrubbed: storm' : 'On pad'}
      gauge={<Gauge fuel={model.fuel} />}
      pad={<Ship phase="pad" layoutId={id} />}
    >
      <Button onClick={() => send({ _tag: 'Fuel' })}>Fuel</Button>
      <Button onClick={() => send({ _tag: 'Drain' })}>Drain</Button>
      <Button tone="go" onClick={() => send({ _tag: 'Launch' })}>
        Launch
      </Button>
    </Bay>
  ),
  Countdown: ({ id, state, model, send }) => (
    <Bay
      phase="countdown"
      status={`T−${state.count}`}
      gauge={<Gauge fuel={model.fuel} />}
      pad={<Ship phase="countdown" layoutId={id} />}
    >
      <Button tone="go" onClick={() => send({ _tag: 'Launch' })}>
        Launch
      </Button>
      <Button tone="stop" onClick={() => send({ _tag: 'Abort' })}>
        Abort
      </Button>
    </Bay>
  ),
  InFlight: ({ id, model, children, send }) => (
    <Bay
      phase="flight"
      status="In flight"
      gauge={<Gauge fuel={model.fuel} />}
      sky={
        <Ship
          phase="flight"
          layoutId={id}
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
  Landed: ({ id, model, send }) => (
    <Bay
      phase="landed"
      status="Landed"
      gauge={<Gauge fuel={model.fuel} />}
      pad={<Ship phase="landed" layoutId={id} />}
    >
      <Button onClick={() => send({ _tag: 'Reset' })}>Reset</Button>
    </Bay>
  ),
  Lost: ({ id, model, send }) => (
    <Bay
      phase="lost"
      status="Lost"
      gauge={<Gauge fuel={model.fuel} />}
      sky={<Ship phase="lost" layoutId={id} />}
    >
      <Button onClick={() => send({ _tag: 'Reset' })}>Reset</Button>
    </Bay>
  ),
});

export const LaunchSiteView = View.make(
  LaunchSite,
  ({ model, children, send }) => (
    <Stage sky={model.weather}>
      <Toolbar>
        <Button
          pressed={model.weather === 'storm'}
          onClick={() => send({ _tag: 'ToggledStorm' })}
        >
          Storm
        </Button>
        <Button onClick={() => send({ _tag: 'Built' })}>Build</Button>
      </Toolbar>
      <Berths>
        <AnimatePresence initial={false}>
          {children.rockets.map((rocket, index) => (
            <motion.div
              key={rocket.id}
              layout
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
            >
              <Berth name={model.rockets[index]!}>
                <RocketView node={rocket} />
              </Berth>
            </motion.div>
          ))}
        </AnimatePresence>
      </Berths>
    </Stage>
  ),
);
