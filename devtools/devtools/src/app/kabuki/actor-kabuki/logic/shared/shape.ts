import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import { Sessions } from '../../../services/sessions/contract/index.js';

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
 *            again, waiting a little longer each time, up to a few seconds
 *            (`workers.ts`).
 * 2. Pick    the Kabuki Session named by the Input, so a link opens it.
 *            Picking one Emits `Picked`, so whoever mounts it can write it
 *            down, as the page does in `?session=`.
 * 3. Follow  the Kabuki Session named by the Props, whenever they name
 *            another one than the Tool shows, as Back and Forward do: the
 *            same Tool moves to it, its list and socket kept, and says
 *            nothing, since whoever named it knows. Its own pick, handed
 *            back, names the one it shows already, so nothing happens.
 * 4. Inspect nothing picked; one picked and live, inspected through
 *            DevTools (`children/actor-remote-inspector/`); or one picked
 *            that is not live, gone, not yet connected, or out of reach
 *            while DevTools is. Its name is kept, and it opens again as
 *            soon as a Kabuki Session of that name connects, as after its
 *            tab reloads.
 */

const Link = Schema.Literals(['connecting', 'live', 'reconnecting']);

const Name = Schema.NullOr(Schema.String);

const State = Schema.TaggedUnion({
  Choice: {},
  Inspection: { name: Schema.String },
  Absence: { name: Schema.String },
});

export type Link = typeof Link.Type;
export type State = typeof State.Type;
export type Summary = typeof KabukiSessionSummary.Type;

export const KabukiShape = Actor.define('Kabuki', {
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
