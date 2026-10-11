import { View } from 'effect-oak/react';
import { Chip, Chips, Circle, Line, Lines } from '../shapes/index.js';
import { Player, Scoreboard } from './keyed-children.js';

/** A Player as one Circle with its name and count inside; clicking it Sends Increment. */
export const PlayerView = View.make(Player, ({ id, model, send }) => (
  <Circle id={id} pulse={model} onClick={() => send({ _tag: 'Increment' })}>
    {model.name} {model.count}
  </Circle>
));

/** The Scoreboard as a Circle with one Line per Player in its Model, each a PlayerView. */
export const ScoreboardView = View.make(
  Scoreboard,
  ({ id, model, children, send }) => (
    <>
      <Circle id={id} pulse={model}>
        {children.players.length}
      </Circle>
      <Lines>
        {children.players.map((player) => (
          <Line key={player.id}>
            <PlayerView instance={player} />
          </Line>
        ))}
      </Lines>
      <Chips>
        <Chip onClick={() => send({ _tag: 'AddPlayer' })}>Add player</Chip>
        <Chip onClick={() => send({ _tag: 'RemoveLast' })}>Remove last</Chip>
      </Chips>
    </>
  ),
);
