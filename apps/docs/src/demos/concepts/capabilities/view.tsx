import { View } from 'effect-oak/react';
import { Chip, Chips, Circle, Line, Lines } from '../shapes/index.js';
import { Board, MOST_PLAYERS, Scorer } from './capabilities.js';

/** A Scorer as a Circle with its name and score; clicking it Sends Score, whose Command reports through Scores. */
export const ScorerView = View.make(Scorer, ({ id, model, send }) => (
  <Circle id={id} pulse={model} onClick={() => send({ _tag: 'Score' })}>
    <span className="flex flex-col items-center leading-tight">
      <span className="text-[10px]">{model.name}</span>
      <span>{model.scored}</span>
    </span>
  </Circle>
));

/** The Board as a Circle with its total, and a Band named Scores down to every Scorer that Requires it. */
export const BoardView = View.make(Board, ({ id, model, children, send }) => (
  <>
    <Circle id={id} pulse={model}>
      {model.total}
    </Circle>
    <Lines band="Scores">
      {children.players.map((player) => (
        <Line key={player.id}>
          <ScorerView instance={player} />
        </Line>
      ))}
    </Lines>
    <Chips>
      <Chip
        disabled={model.players.length >= MOST_PLAYERS}
        onClick={() => send({ _tag: 'AddPlayer' })}
      >
        Add player
      </Chip>
      <Chip
        disabled={model.players.length === 0}
        onClick={() => send({ _tag: 'RemoveLast' })}
      >
        Remove last
      </Chip>
    </Chips>
  </>
));
