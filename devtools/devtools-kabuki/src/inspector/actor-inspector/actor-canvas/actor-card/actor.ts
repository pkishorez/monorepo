import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Node, Step } from '../../../../api/index.ts';
import { KabukiSession } from '../../../kabuki-session/index.ts';

/*
 * One card open on the canvas: what the Kabuki Session answers for its
 * Instance at the Step shown, its State, Model and Props, what the Step
 * did to them, and its Schemas. It lives as long as the card is open, and
 * reads again at each new Step, and, live, at each change of the app.
 */

const Props = Schema.Struct({
  /** The Step shown; null for the Head, as the app is now. */
  at: Schema.NullOr(Step),
  /** Counts the app's changes, so the Head read again is told apart. */
  revision: Schema.Number,
});

export const Card = Actor.define('Card', {
  requires: [KabukiSession],
  input: Schema.Struct({ instance: Schema.String }),
  props: Props,
  model: Schema.Struct({
    instance: Schema.String,
    node: Schema.NullOr(Node),
    /** Why the last read failed: the Instance not there at the Step, say. */
    problem: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Read: { node: Node },
    Failed: { problem: Schema.String },
  }),
});

/** What is read: a Step's card stays as it is; the Head's, after each change. */
const readOf = ({ at, revision }: typeof Props.Type) =>
  at === null ? `head#${revision}` : `${at}`;

export const CardLive = Actor.build(Card, {
  init: ({ instance }) => ({ model: { instance, node: null, problem: null } }),
  workers: {
    read: {
      each: ({ props }) => [readOf(props)],
      run: (self) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const session = yield* KabukiSession;
          yield* session
            .node({
              instance: model.instance,
              ...(props.at === null ? {} : { at: props.at }),
            })
            .pipe(
              Effect.matchEffect({
                onSuccess: (node) => self.send({ _tag: 'Read', node }),
                onFailure: (error) =>
                  self.send({ _tag: 'Failed', problem: error._tag }),
              }),
            );
        }),
    },
  },
  on: {
    Read: ({ node }, { model }) => ({
      model: { ...model, node, problem: null },
    }),
    Failed: ({ problem }, { model }) => ({ model: { ...model, problem } }),
  },
});
