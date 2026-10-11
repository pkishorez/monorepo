import { View } from 'effect-oak/react';
import type { ViewProps } from 'effect-oak/react';
import { Action, Flight } from '../draw/index.js';
import { Rocket } from './rocket.js';

const draw = ({ id, model, state, send }: ViewProps<typeof Rocket>) => (
  <Flight
    flies
    id={id}
    tag={state._tag}
    fuel={model.fuel}
    safe={state._tag !== 'Descending' || state.safe}
    onFuel={() => send({ _tag: 'Fuel' })}
    actions={
      <>
        {state._tag === 'OnPad' && model.fuel > 0 && (
          <Action onClick={() => send({ _tag: 'Launch' })}>Launch</Action>
        )}
        {state._tag === 'Cruising' && (
          <Action onClick={() => send({ _tag: 'Land' })}>Land</Action>
        )}
        {state._tag === 'Lost' && (
          <Action onClick={() => send({ _tag: 'Rebuild' })}>Rebuild</Action>
        )}
      </>
    }
    landed={
      <>
        {state._tag === 'Landed' && (
          <Action onClick={() => send({ _tag: 'Return' })}>Return</Action>
        )}
        {state._tag === 'Crashed' && (
          <Action onClick={() => send({ _tag: 'Rebuild' })}>Rebuild</Action>
        )}
      </>
    }
  />
);

/** Every State is drawn by the same component; Motion moves the rocket between them. */
export const RocketView = View.make(Rocket, {
  OnPad: draw,
  Ascending: draw,
  Separating: draw,
  Cruising: draw,
  Descending: draw,
  Landed: draw,
  Returning: draw,
  Crashed: draw,
  Lost: draw,
});
