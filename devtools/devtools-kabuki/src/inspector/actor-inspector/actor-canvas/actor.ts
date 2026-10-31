import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Graph, Step } from '../../../api/index.ts';
import { KabukiSession } from '../../kabuki-session/index.ts';
import { CardLive } from './actor-card/index.ts';
import { Opening } from './capabilities/opening.ts';

/*
 * The canvas: the app at the Step shown, every Instance a card, laid out
 * and drawn by its View (./ui).
 *
 * 1. Graph   what the Kabuki Session answers for the Step: read again at
 *            each new Step, and, live, at each change of the app.
 * 2. Cards   one Card per card open, reading its Instance's data while it
 *            is open (./actor-card).
 * 3. Open    a card the reader opens or closes is asked of whoever placed
 *            the canvas, who keeps the cards open.
 */

const Props = Schema.Struct({
  /** The Step shown; null for the Head, as the app is now. */
  at: Schema.NullOr(Step),
  /** Counts the app's changes, so the Head read again is told apart. */
  revision: Schema.Number,
  /** The cards open, by Instance. */
  opened: Schema.Array(Schema.String),
  /** A card to bring into view, each time its `key` changes. */
  bring: Schema.NullOr(
    Schema.Struct({ id: Schema.String, key: Schema.String }),
  ),
  /** Keep the whole tree in view as it changes, nothing to press: presenting. */
  follow: Schema.Boolean,
});

export const Canvas = Actor.define('Canvas', {
  requires: [KabukiSession, Opening],
  props: Props,
  model: Schema.Struct({
    graph: Schema.NullOr(Graph),
    /** Why the Step could not be drawn: no longer kept, or the Kabuki Session gone. */
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Drawn: { graph: Graph },
    Failed: { problem: Schema.String },
    Opened: { id: Schema.String, open: Schema.Boolean },
  }),
});

// 3. Open
const open = Command.make('open', {
  args: Schema.Struct({ id: Schema.String, open: Schema.Boolean }),
  run: ({ id, open }) =>
    Effect.flatMap(Opening, (opening) => opening.open(id, open)),
});

/** What is drawn: a Step's graph stays as it is; the Head's, after each change. */
const drawnOf = ({ at, revision }: typeof Props.Type) =>
  at === null ? `head#${revision}` : `${at}`;

export const CanvasLive = Actor.build(Canvas, {
  init: () => ({ model: { graph: null, problem: null } }),
  // 2. Cards
  children: (child) => ({
    card: child(CardLive, {
      each: ({ props }) => props.opened,
      input: (_, instance) => ({ instance }),
      props: ({ props }) => ({ at: props.at, revision: props.revision }),
    }),
  }),
  // 1. Graph
  workers: {
    draw: {
      each: ({ props }) => [drawnOf(props)],
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const session = yield* KabukiSession;
          yield* session.graph(props.at === null ? {} : { at: props.at }).pipe(
            Effect.matchEffect({
              onSuccess: (graph) => self.send({ _tag: 'Drawn', graph }),
              onFailure: (error) =>
                self.send({
                  _tag: 'Failed',
                  problem:
                    error._tag === 'StepNotFound'
                      ? 'This Step is no longer kept.'
                      : 'The Kabuki Session did not answer.',
                }),
            }),
          );
        }),
    },
  },
  on: {
    Drawn: ({ graph }) => ({ model: { graph, problem: null } }),
    Failed: ({ problem }, { model }) => ({ model: { ...model, problem } }),
    Opened: ({ id, open: shown }) => ({ command: open({ id, open: shown }) }),
  },
});
