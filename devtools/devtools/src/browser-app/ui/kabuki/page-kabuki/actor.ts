import { Effect, Schema, Stream } from 'effect';
import { Page, Router } from '@kestack/kabuki/routing';
import { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import { Sessions } from '../sessions/index.js';
import { RemoteInspectorLive } from './actor-inspector/index.js';

/*
 * `/kabuki`: every Kabuki Session connected to this DevTools, live, and
 * the Inspector on the one picked.
 *
 * 1. Watch   the live list, from the DevTools Server: now, and after every
 *            change, so a Kabuki Session shows up the moment it connects
 *            and goes the moment it leaves. When the socket to DevTools
 *            drops, the list stays, marked reconnecting, and it is dialed
 *            again, waiting a little longer each time, up to a few seconds.
 * 2. Pick    the Kabuki Session named by `?session=`, so a link opens it.
 *            Picking one writes it there; Back and Forward pick what the
 *            address says.
 * 3. Inspect nothing picked; one picked and live, inspected through
 *            DevTools (`actor-inspector/`); or one picked that is not live,
 *            gone, not yet connected, or out of reach while DevTools is.
 *            Its name is kept, and it opens again as soon as a Kabuki
 *            Session of that name connects, as after its tab reloads.
 */

/** How long the first redial waits, and the longest any waits, in milliseconds. */
const FIRST_WAIT = 250;
const LAST_WAIT = 4000;

const Link = Schema.Literals(['connecting', 'live', 'reconnecting']);

const State = Schema.TaggedUnion({
  None: {},
  Open: { name: Schema.String },
  Away: { name: Schema.String },
});
type State = typeof State.Type;
type Summary = typeof KabukiSessionSummary.Type;

/** This page, with the Kabuki Session named, or none. */
export const kabukiRoute = (name: string | null) =>
  name === null
    ? { _tag: 'Kabuki' as const }
    : { _tag: 'Kabuki' as const, session: name };

export const Kabuki = Page.define({
  path: '/kabuki',
  query: { session: Schema.optionalKey(Schema.String) },
  requires: [Sessions],
  model: Schema.Struct({
    /** The live Kabuki Sessions, oldest first; null until DevTools first says. */
    sessions: Schema.NullOr(Schema.Array(KabukiSessionSummary)),
    /** The socket to DevTools the list comes over. */
    link: Link,
  }),
  state: State,
  message: Schema.TaggedUnion({
    Listed: { sessions: Schema.Array(KabukiSessionSummary) },
    Dropped: {},
    Chosen: { name: Schema.NullOr(Schema.String) },
    Addressed: { name: Schema.NullOr(Schema.String) },
  }),
});

const nameOf = (state: State) => (state._tag === 'None' ? null : state.name);

// 3. Inspect
const placed = (
  name: string | null,
  sessions: ReadonlyArray<Summary> | null,
): State => {
  if (name === null) return { _tag: 'None' };
  return sessions?.some((one) => one.name === name)
    ? { _tag: 'Open', name }
    : { _tag: 'Away', name };
};

export const KabukiLive = Page.build(Kabuki, {
  init: () => ({
    model: { sessions: null, link: 'connecting' },
    state: { _tag: 'None' },
  }),
  workers: {
    // 1. Watch
    watch: {
      run: (self) =>
        Effect.gen(function* () {
          const sessions = yield* Sessions;
          let wait = FIRST_WAIT;
          while (true) {
            // A list that ends or fails is the socket closing: Dropped
            // says so, and the next turn dials again.
            yield* sessions.watch.pipe(
              Stream.runForEach((list) => {
                wait = FIRST_WAIT;
                return self.send({ _tag: 'Listed', sessions: list });
              }),
              Effect.catch(() => Effect.void),
            );
            const { model } = yield* self.get;
            if (model.link === 'live') yield* self.send({ _tag: 'Dropped' });
            yield* Effect.sleep(wait);
            wait = Math.min(wait * 2, LAST_WAIT);
          }
        }),
    },
    // 2. Pick: whatever the address names, as it starts and after each move.
    address: {
      each: ({ props }) => [props.query.session ?? ''],
      run: (self, name) =>
        self.send({ _tag: 'Addressed', name: name === '' ? null : name }),
    },
  },
  on: {
    Listed: ({ sessions }, { state }) => ({
      model: { sessions, link: 'live' },
      state: placed(nameOf(state), sessions),
    }),
    Dropped: (_, { model, state }) => ({
      model: { ...model, link: 'reconnecting' },
      ...(state._tag === 'Open'
        ? { state: { _tag: 'Away' as const, name: state.name } }
        : {}),
    }),
    // 2. Pick
    Chosen: ({ name }, { model, state }) =>
      name === nameOf(state)
        ? {}
        : {
            state: placed(name, model.sessions),
            command: Router.push(kabukiRoute(name)),
          },
    Addressed: ({ name }, { model, state }) =>
      name === nameOf(state) ? {} : { state: placed(name, model.sessions) },
  },
  state: {
    Open: {
      children: {
        inspector: {
          actor: RemoteInspectorLive,
          // Connected again under the same name, it is reached anew.
          key: ({ model, state }) =>
            `${state.name}@${model.sessions?.find((one) => one.name === state.name)?.connectedAt ?? 0}`,
          input: ({ state }) => ({ name: state.name }),
        },
      },
    },
  },
});
