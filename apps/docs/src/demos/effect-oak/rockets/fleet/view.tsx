import { View } from 'effect-oak/react';
import { AnimatePresence, motion } from 'motion/react';
import { MOST, Pill, Place, Site, Toolbar } from '../draw/index.js';
import { RocketView } from '../state/index.js';
import { Fleet } from './fleet.js';

export const FleetView = View.make(Fleet, ({ model, children, send }) => (
  <div className="relative size-full">
    <Toolbar>
      <Pill
        disabled={model.rockets.length >= MOST}
        onClick={() => send({ _tag: 'Build' })}
      >
        Build a rocket
      </Pill>
    </Toolbar>
    <Site count={children.rockets.length} landing top={72}>
      <AnimatePresence>
        {children.rockets.map((rocket, index) => (
          <motion.div key={rocket.id} exit={{ opacity: 0 }}>
            <Place index={index} name={model.rockets[index]!}>
              <RocketView node={rocket} />
            </Place>
          </motion.div>
        ))}
      </AnimatePresence>
    </Site>
  </div>
));
