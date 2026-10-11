import { View } from 'effect-oak/react';
import { Chip, Chips, Circle, Slots } from '../shapes/index.js';
import type { Ring } from '../shapes/index.js';
import { Clock } from './workers.js';

/**
 * The Clock as Slots for Stopped and Running, the Circle showing its ticks,
 * and one Ring per Worker whose Condition holds, read from the same Model and
 * State the Actor's Conditions read.
 */
export const ClockView = View.make(
  Clock,
  ({ id, model, state, _tag, send }) => {
    const rings: Array<Ring> = [{ name: 'tick' }];
    if (_tag === 'Running') rings.push({ name: 'run' });
    if (model.armed) rings.push({ name: 'blink' });
    for (const { key } of model.countdowns)
      rings.push({ name: 'countdown', key });
    return (
      <>
        <Slots
          name="Clock"
          states={Clock.definition.states}
          lit={_tag}
          data={_tag === 'Running' ? `ran ${state.ran}` : undefined}
        >
          <Circle
            id={id}
            pulse={model}
            rings={rings}
            onClick={() => send({ _tag: 'Toggle' })}
          >
            <span className={model.blink ? 'text-primary' : undefined}>
              {model.ticks}
            </span>
          </Circle>
        </Slots>
        <Chips>
          <Chip onClick={() => send({ _tag: 'Arm' })}>
            {model.armed ? 'Disarm' : 'Arm'}
          </Chip>
          <Chip onClick={() => send({ _tag: 'AddCountdown' })}>
            Add countdown
          </Chip>
        </Chips>
        {model.done.length > 0 && (
          <div className="font-mono text-[10px] text-muted-foreground">
            done {model.done.join(' ')}
          </div>
        )}
      </>
    );
  },
);
