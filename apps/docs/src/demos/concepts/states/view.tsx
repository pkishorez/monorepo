import { View } from 'effect-oak/react';
import { Chip, Chips, Circle, Slots } from '../shapes/index.js';
import { Door } from './states.js';

/** The Door as Slots, one per State, with the Circle in the lit one and the code written under it while Locked. */
export const DoorView = View.make(Door, ({ id, _tag, state, send }) => (
  <>
    <Slots
      name="Door"
      states={Door.definition.states}
      lit={_tag}
      data={_tag === 'Locked' ? `code ${state.code}` : undefined}
    >
      <Circle id={id} pulse={state} onClick={() => send({ _tag: 'Toggle' })} />
    </Slots>
    <Chips>
      <Chip onClick={() => send({ _tag: 'Lock', code: '1234' })}>
        Lock 1234
      </Chip>
      <Chip onClick={() => send({ _tag: 'Unlock', code: '1234' })}>
        Unlock 1234
      </Chip>
      <Chip onClick={() => send({ _tag: 'Unlock', code: '0000' })}>
        Unlock 0000
      </Chip>
    </Chips>
  </>
));
