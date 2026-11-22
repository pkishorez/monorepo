import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import { Sessions } from './sessions/index.js';
import { RemoteInspectorLive } from './actor-inspector/index.js';

/*
 * The Kabuki Tool: every Kabuki Session connected to this DevTools, live,
 * and the Inspector on the one picked. It knows nothing of URLs: whoever
 * mounts it hands it the Kabuki Session to start on, may hand it the one to
 * show from then on, and hears which one is picked. Mounted on its own, as
 * the root, it is handed none and follows only its own picks.
 *
 * 1. Watch   the live list, from the DevTools Server: now, and after every
 *            change, so a Kabuki Session shows up the moment it connects
 *            and goes the moment it leaves. When the socket to DevTools
 *            drops, the list stays, marked reconnecting, and it is dialed
 *            again, waiting a little longer each time, up to a few seconds.
 * 2. Pick    the Kabuki Session named by the Input, so a link opens it.
 *            Picking one Emits `Picked`, so whoever mounts it can write it
 *            down, as the page does in `?session=`.
 * 3. Follow  the Kabuki Session named by the Props, whenever they name
 *            another one than the Tool shows, as Back and Forward do: the
 *            same Tool moves to it, its list and socket kept, and says
 *            nothing, since whoever named it knows. Its own pick, handed
 *            back, names the one it shows already, so nothing happens.
 * 4. Inspect nothing picked; one picked and live, inspected through
 *            DevTools (`actor-inspector/`); or one picked that is not live,
 *            gone, not yet connected, or out of reach while DevTools is.
 *            Its name is kept, and it opens again as soon as a Kabuki
 *            Session of that name connects, as after its tab reloads.
 */

/** How long the first redial waits, and the longest any waits, in milliseconds. */
const FIRST_WAIT = 250;
const LAST_WAIT = 4000;

const Link = Schema.Literals(['connecting', 'live', 'reconnecting']);

const Name = Schema.NullOr(Schema.String);

const State = Schema.TaggedUnion({
  None: {},
  Open: { name: Schema.String },
  Away: { name: Schema.String },
});
type State = typeof State.Type;
type Summary = typeof KabukiSessionSummary.Type;

export const Kabuki = Actor.define('Kabuki', {
  requires: [Sessions],
  /** The Kabuki Session to start on, or none. */
  input: Schema.Struct({ session: Name }),
  /**
   * The Kabuki Session to show, or none, from whoever mounts it; nothing
   * at all for a Tool mounted on its own, which follows only its picks.
   */
  props: Schema.UndefinedOr(Schema.Struct({ session: Name })),
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
    Chosen: { name: Name },
    Followed: { name: Name },
  }),
  emits: { Picked: { name: Name } },
});

const nameOf = (state: State) => (state._tag === 'None' ? null : state.name);

// 4. Inspect
const placed = (
  name: string | null,
  sessions: ReadonlyArray<Summary> | null,
): State => {
  if (name === null) return { _tag: 'None' };
  return sessions?.some((one) => one.name === name)
    ? { _tag: 'Open', name }
    : { _tag: 'Away', name };
};

export const KabukiLive = Kabuki.build({
  // 2. Pick: the one the Input names, not live until DevTools says it is.
  init: ({ session }) => ({
    model: { sessions: null, link: 'connecting' },
    state: placed(session, null),
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
    // 3. Follow: once for each Kabuki Session the Props name, as they
    // start and after each change; '' is none.
    follow: {
      each: ({ props }) => (props === undefined ? [] : [props.session ?? '']),
      run: (self, name) =>
        self.send({ _tag: 'Followed', name: name === '' ? null : name }),
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
            emit: { _tag: 'Picked', name },
          },
    // 3. Follow
    Followed: ({ name }, { model, state }) =>
      name === nameOf(state) ? {} : { state: placed(name, model.sessions) },
  },
  states: {
    Open: {
      children: {
        inspector: Actor.child(RemoteInspectorLive, {
          // Connected again under the same name, it is reached anew.
          key: ({ model, state }) =>
            `${state.name}@${model.sessions?.find((one) => one.name === state.name)?.connectedAt ?? 0}`,
          input: ({ state }) => ({ name: state.name }),
        }),
      },
    },
  },
});
