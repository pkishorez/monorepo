import { View } from 'effect-oak/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Action,
  Flight,
  MOST,
  Pill,
  Place,
  Rain,
  Site,
  Toolbar,
} from '../draw/index.js';
import { Fleet } from './fleet.js';
import { Rocket } from './rocket.js';

/** A scrubbed launch says why, for a moment, over the rocket. */
const Scrubbed = () => (
  <motion.p
    className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 text-xs whitespace-nowrap"
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: [0, 1, 1, 0], y: 0 }}
    transition={{ duration: 2.6, times: [0, 0.1, 0.8, 1] }}
  >
    Storm overhead
  </motion.p>
);

export const RocketView = View.make(
  Rocket,
  ({ _tag, id, model, state, send, frame }) => {
    const scrubbed =
      model.scrubbedAt !== null && frame.get() - model.scrubbedAt < 600;
    return (
      <Flight
        flies
        id={id}
        tag={_tag}
        fuel={model.fuel}
        safe={_tag !== 'Descending' || state.safe}
        shake={scrubbed ? model.scrubbedAt : null}
        note={scrubbed && <Scrubbed key={model.scrubbedAt} />}
        onFuel={() => send({ _tag: 'Fuel' })}
        actions={
          <>
            {_tag === 'OnPad' && model.fuel > 0 && (
              <Action onClick={() => send({ _tag: 'Launch' })}>Launch</Action>
            )}
            {_tag === 'Cruising' && (
              <Action onClick={() => send({ _tag: 'Land' })}>Land</Action>
            )}
            {_tag === 'Lost' && (
              <Action onClick={() => send({ _tag: 'Rebuild' })}>Rebuild</Action>
            )}
          </>
        }
        landed={
          <>
            {_tag === 'Landed' && (
              <Action onClick={() => send({ _tag: 'Return' })}>Return</Action>
            )}
            {_tag === 'Crashed' && (
              <Action onClick={() => send({ _tag: 'Rebuild' })}>Rebuild</Action>
            )}
            {(_tag === 'Landed' || _tag === 'Crashed') && (
              <Action onClick={() => send({ _tag: 'Dismantle' })}>
                Dismantle
              </Action>
            )}
          </>
        }
      />
    );
  },
);

export const FleetView = View.make(Fleet, ({ model, children, send }) => (
  <div className="relative size-full">
    <AnimatePresence>{model.sky === 'storm' && <Rain />}</AnimatePresence>
    <Toolbar>
      <Pill
        disabled={model.rockets.length >= MOST}
        onClick={() => send({ _tag: 'Build' })}
      >
        Build a rocket
      </Pill>
      <Pill
        pressed={model.sky === 'storm'}
        onClick={() => send({ _tag: 'ToggledSky' })}
      >
        {model.sky === 'storm' ? 'Storm' : 'Clear sky'}
      </Pill>
    </Toolbar>
    <Site count={children.rockets.length} landing top={72}>
      <AnimatePresence>
        {children.rockets.map((rocket, index) => (
          <motion.div key={rocket.id} exit={{ opacity: 0 }}>
            <Place index={index} name={model.rockets[index]!}>
              <RocketView instance={rocket} />
            </Place>
          </motion.div>
        ))}
      </AnimatePresence>
    </Site>
  </div>
));
