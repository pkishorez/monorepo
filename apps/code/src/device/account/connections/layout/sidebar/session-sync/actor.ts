import { Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Replicas } from '@kestack/std-toolkit/replica';
import { everything, MessageIds } from '../../../connection/records/index.ts';

/*
 * Session Sync: the messages of every session the sidebar shows, synced
 * before it is opened, so its page draws them from this device at once.
 *
 * 1. Shown   the unsettled sessions of the Connections the sidebar reads, as
 *            this device holds them, followed as they come, go, settle and
 *            un-settle, and as the Connection Filter or the list changes the
 *            Connections read.
 * 2. Hold    one `MessageIds` Query each, keyed by its session's id: its
 *            `where` on the session opens the session's Window, as the
 *            session's page's `Messages` does, whose Strategy syncs its
 *            messages over its Connection's one socket while the Query runs,
 *            and resumes after each reconnect from the newest message it
 *            passed on. It selects only ids, so what it holds, and the
 *            History of it, stay small however long the session. A session
 *            no longer shown lets its Window go, which closes once the
 *            Replica's GC Time passes with nothing else holding it.
 * Nothing here is drawn: it is a Child of the sidebar's Actor, which runs
 * whether or not the sidebar is on screen, as on a phone, where it is shut
 * on every page but home.
 */

const Shown = Schema.Struct({
  connectionId: Schema.String,
  sessionId: Schema.String,
});
type Shown = typeof Shown.Type;

const sameShown = Schema.toEquivalence(Schema.Array(Shown));

/** Every project and session held of the Connections read. */
type Everything = Stream.Success<ReturnType<typeof everything>>;

/** 1. Shown: the unsettled sessions held, each by its Connection and id. */
export const shownOf = ({ sessions }: Everything): ReadonlyArray<Shown> =>
  sessions
    .filter(({ settledAt }) => settledAt === null)
    .map(({ connectionId, id }) => ({ connectionId, sessionId: id }));

const SessionSync = Actor.define('SessionSync', {
  requires: [Replicas],
  props: Schema.Struct({
    /** The Connections the sidebar reads; none until it can choose them. */
    connectionIds: Schema.Array(Schema.String),
  }),
  model: Schema.Struct({ shown: Schema.Array(Shown) }),
  message: Schema.TaggedUnion({
    ShownRead: { shown: Schema.Array(Shown) },
  }),
});

export const SessionSyncLive = Actor.build(SessionSync, {
  init: () => ({ model: { shown: [] } }),
  children: {
    // 2. Hold
    messages: {
      actor: MessageIds,
      each: ({ model }) => model.shown.map(({ sessionId }) => sessionId),
      props: ({ model }, sessionId) => ({
        connectionId:
          model.shown.find((each) => each.sessionId === sessionId)
            ?.connectionId ?? '',
        sessionId,
      }),
    },
  },
  workers: {
    // 1. Shown: read again for each set of Connections read.
    shown: {
      each: ({ props }) => [props.connectionIds.join(' ')],
      run: (self, ids) =>
        everything(ids === '' ? [] : ids.split(' ')).pipe(
          Stream.map(shownOf),
          Stream.changesWith(sameShown),
          Stream.runForEach((shown) =>
            self.send({ _tag: 'ShownRead', shown: [...shown] }),
          ),
        ),
    },
  },
  on: {
    ShownRead: ({ shown }, { model }) =>
      sameShown(shown, model.shown) ? {} : { model: { ...model, shown } },
  },
});
