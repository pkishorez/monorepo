import { View } from 'effect-oak/react';
import { CounterView } from '../actor/index.js';
import { Circle, Line, Lines, Slots } from '../shapes/index.js';
import { Room } from './children.js';

/** The Room as Slots, with the Circle in the lit one and, while Occupied, the Counter on a Line under it. */
export const RoomView = View.make(Room, (props) => {
  const { id, _tag, state, send } = props;
  return (
    <Slots name="Room" states={Room.definition.states} lit={_tag}>
      <Circle id={id} pulse={state} onClick={() => send({ _tag: 'Toggle' })} />
      {props._tag === 'Occupied' && (
        <Lines>
          <Line key={props.children.counter.id}>
            <CounterView instance={props.children.counter} />
          </Line>
        </Lines>
      )}
    </Slots>
  );
});
