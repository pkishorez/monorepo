import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { Graph, GraphNode, Step } from '../../../api/index.ts';
import { KabukiSession } from '../../kabuki-session/index.ts';
import { CardLive } from './actor-card/index.ts';
import { Opening } from './capabilities/opening.ts';

/*
 * The canvas: the app at the Step shown, every Instance a card, laid out
 * and drawn by its View (./ui); or, given `blueprint`, every Actor the
 * app's root can grow, whether it runs or not.
 *
 * 1. Graph   what the Kabuki Session answers for the Step: read again at
 *            each new Step, and, live, at each change of the app. The
 *            Blueprint is read once each time it is shown: it holds only
 *            what the Actors declare.
 * 2. Cards   one Card per card open, reading its Instance's data while it
 *            is open (./actor-card).
 * 3. Open    a card the reader opens or closes, or an Instance's Trail
 *            followed or let go, is asked of whoever placed the canvas,
 *            who keeps the cards open.
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
  /** Draw the Blueprint instead of the app at a Step. */
  blueprint: Schema.Boolean,
  /** The Instance whose Trail is followed: only its card is drawn; null for the whole tree. */
  only: Schema.NullOr(Schema.String),
});

export const Canvas = Actor.define('Canvas', {
  requires: [KabukiSession, Opening],
  props: Props,
  model: Schema.Struct({
    graph: Schema.NullOr(Graph),
    /** The Blueprint, once read. */
    print: Schema.NullOr(GraphNode),
    /** Why the Step could not be drawn: no longer kept, or the Kabuki Session gone. */
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Drawn: { graph: Graph },
    Printed: { root: GraphNode },
    Failed: { problem: Schema.String },
    Opened: { id: Schema.String, open: Schema.Boolean },
    Zoomed: { id: Schema.String },
  }),
});

// 3. Open
const open = Command.make('open', {
  args: Schema.Struct({ id: Schema.String, open: Schema.Boolean }),
  run: ({ id, open }) =>
    Effect.flatMap(Opening, (opening) => opening.open(id, open)),
});

const zoom = Command.make('zoom', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) => Effect.flatMap(Opening, (opening) => opening.zoom(id)),
});

/** What is drawn: the Blueprint and a Step's graph stay as they are; the Head's, after each change. */
const drawnOf = ({ at, revision, blueprint }: typeof Props.Type) =>
  blueprint ? 'print' : at === null ? `head#${revision}` : `${at}`;

const problemOf = (error: { readonly _tag: string }) =>
  error._tag === 'StepNotFound'
    ? 'This Step is no longer kept.'
    : 'The Kabuki Session did not answer.';

export const CanvasLive = Canvas.build({
  init: () => ({
    model: {
      graph: null,
      print: null,
      problem: null,
    },
  }),
  // 2. Cards
  children: {
    card: Actor.child(CardLive, {
      // The Blueprint's cards are no Instance: nothing to read for them.
      each: ({ props }) => (props.blueprint ? [] : props.opened),
      input: (_, instance) => ({ instance }),
      props: ({ props }) => ({ at: props.at, revision: props.revision }),
    }),
  },
  // 1. Graph
  workers: {
    draw: {
      each: ({ props }) => [drawnOf(props)],
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const session = yield* KabukiSession;
          if (props.blueprint)
            return yield* session.blueprint().pipe(
              Effect.matchEffect({
                onSuccess: ({ root }) => self.send({ _tag: 'Printed', root }),
                onFailure: (error) =>
                  self.send({ _tag: 'Failed', problem: problemOf(error) }),
              }),
            );
          yield* session.graph(props.at === null ? {} : { at: props.at }).pipe(
            Effect.matchEffect({
              onSuccess: (graph) => self.send({ _tag: 'Drawn', graph }),
              onFailure: (error) =>
                self.send({ _tag: 'Failed', problem: problemOf(error) }),
            }),
          );
        }),
    },
  },
  on: {
    Drawn: ({ graph }, { model }) => ({
      model: { ...model, graph, problem: null },
    }),
    Printed: ({ root }, { model }) => ({
      model: { ...model, print: root, problem: null },
    }),
    Failed: ({ problem }, { model }) => ({ model: { ...model, problem } }),
    Opened: ({ id, open: shown }) => ({ command: open({ id, open: shown }) }),
    Zoomed: ({ id }) => ({ command: zoom({ id }) }),
  },
});
