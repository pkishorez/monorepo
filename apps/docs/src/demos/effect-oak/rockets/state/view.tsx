import { View } from 'effect-oak/react';
import { Action, Flight } from '../draw/index.js';
import { Rocket } from './rocket.js';

/** One function draws every State; Motion moves the rocket between them. */
export const RocketView = View.make(
  Rocket,
  ({ _tag, id, model, state, send }) => (
    <Flight
      flies
      id={id}
      tag={_tag}
      fuel={model.fuel}
      safe={_tag !== 'Descending' || state.safe}
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
        </>
      }
    />
  ),
);
