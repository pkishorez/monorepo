import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Cell, LIVES } from '../rules.ts';
import { Keyboard } from '../capabilities/keyboard.ts';
import { Referee } from '../capabilities/referee.ts';
import { GameLive } from '../game/game.ts';

/*
 * The Stage keeps the score and the lives. It Invokes a Game only while
 * Playing, so the end of a game stops the Game and every Worker it ran,
 * with no code to say so, and the next game is a fresh one. It Provides
 * the Referee the Game reports to, and hands it the lives as Props.
 */
export const Stage = Actor.define('Stage', {
  requires: [Keyboard],
  model: Schema.Struct({
    lives: Schema.Number,
    score: Schema.Number,
    best: Schema.Number,
  }),
  state: Schema.TaggedUnion({
    Ready: {},
    Playing: {},
    /** The snake as it lay when the last life ran out. */
    Over: { body: Schema.Array(Cell) },
  }),
  message: Schema.TaggedUnion({
    Start: {},
    Scored: {},
    Crashed: { body: Schema.Array(Cell) },
  }),
});

const start = (best: number) => ({
  model: { lives: LIVES, score: 0, best },
  state: { _tag: 'Playing' } as const,
});

export const StageLive = Stage.build({
  init: () => ({
    model: { lives: LIVES, score: 0, best: 0 },
    state: { _tag: 'Ready' },
  }),
  workers: {
    // Space starts a game, whenever there is none.
    start: {
      while: ({ state }) => state._tag !== 'Playing',
      run: (self) =>
        Effect.gen(function* () {
          const keyboard = yield* Keyboard;
          yield* Stream.runForEach(
            keyboard.presses.pipe(Stream.filter((press) => press === 'space')),
            () => self.send({ _tag: 'Start' }),
          );
        }),
    },
  },
  states: {
    Ready: { on: { Start: (_, { model }) => start(model.best) } },
    Playing: {
      children: {
        game: Actor.child(GameLive, {
          props: ({ model }) => ({ lives: model.lives }),
        }),
      },
      provides: (self) =>
        Layer.succeed(Referee, {
          scored: self.send({ _tag: 'Scored' }),
          crashed: (body) => self.send({ _tag: 'Crashed', body }),
        }),
      on: {
        Scored: (_, { model }) => {
          const score = model.score + 1;
          return {
            model: { ...model, score, best: Math.max(model.best, score) },
          };
        },
        Crashed: ({ body }, { model }) => {
          const lives = model.lives - 1;
          return {
            model: { ...model, lives },
            ...(lives === 0 ? { state: { _tag: 'Over', body } } : {}),
          };
        },
      },
    },
    Over: { on: { Start: (_, { model }) => start(model.best) } },
  },
});
