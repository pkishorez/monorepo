import { View } from 'effect-oak/react';
import { AnimatePresence, motion } from 'motion/react';
import { LaunchSite, Rocket } from '../capabilities/index.js';
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
import { Booster } from '../more-actors/index.js';

export const BoosterView = View.make(Booster, {
  Firing: () => <Pod firing />,
  Spent: () => (
    <motion.div
      className="size-full"
      animate={{ x: -24, y: 140, rotate: -40, opacity: 0 }}
      transition={{ duration: 1.4, ease: [0.5, 0, 0.9, 0.6] }}
    >
      <Pod firing={false} />
    </motion.div>
  ),
});

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
