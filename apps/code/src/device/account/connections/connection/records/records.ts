import { eq } from '@tanstack/db';
import { Effect, Queue, Schema, Stream } from 'effect';
import { CodeReplica, type Project, type Session } from '@kestack/connect/code';
import { Query } from '@kestack/std-toolkit/replica';

/*
 * What the pages read of the Connections, as Queries over their `CodeReplica`
 * Instances, `CodeReplica.get(connectionId)`, one per Connection, each syncing over its
 * own Connection's socket. `Projects` and `Sessions` read one Connection each,
 * placed one per Connection (`across`), and each row says which Connection it is
 * from; a row, or a session's messages, are read from the one Connection its
 * address names.
 * Projects and sessions sync whole while the app runs; a session's
 * messages sync only while `Messages` filters on its id, which opens that
 * session's Window; `MessageIds` opens it the same way and keeps only the
 * ids, for a Window held open with nothing drawn. `everything` follows every project and session for a
 * Worker, which hands them to a Picker while it is open, `lineage` one
 * session and the ones it was forked from, for a page's Worker, and
 * `arrival` waits for one session to be held. Where the user moves a
 * session, on its way to its Connection, is `moves/`.
 */

/** A record as read from one Connection: its own fields, and the Connection's id. */
export type OnConnection<A> = A & { readonly connectionId: string };

const OfConnection = Schema.Struct({ connectionId: Schema.String });
const OfProject = Schema.Struct({
  connectionId: Schema.String,
  projectId: Schema.String,
});
const OfSession = Schema.Struct({
  connectionId: Schema.String,
  sessionId: Schema.String,
});

/**
 * A Query of one Connection, placed as an `each` Child: one key per Connection,
 * its id, so a Connection read stays read, its rows with it, whatever the list
 * of Connections around it does.
 */
export const across = {
  each: (connectionIds: ReadonlyArray<string>) => connectionIds,
  props: (connectionId: string) => ({ connectionId }),
};

/** The Instance of each Connection named, by Connection id. */
const instancesOf = (connectionIds: ReadonlyArray<string>) =>
  Effect.map(
    Effect.forEach(connectionIds, (connectionId) =>
      Effect.map(
        CodeReplica.get(connectionId),
        (ai) => [connectionId, ai] as const,
      ),
    ),
    (pairs) => Object.fromEntries(pairs),
  );

/** One Connection's Instance, as a Query reads it. */
const one = ({
  props,
}: {
  readonly props: { readonly connectionId: string };
}) => Effect.all({ ai: CodeReplica.get(props.connectionId) });

/** The name a Query's `neverSynced` gives a Connection's Instance. */
export const instanceOf = (connectionId: string) =>
  CodeReplica.instanceName(connectionId);

/** Every project of one Connection, each with its Connection. */
export const Projects = Query.make('Projects', {
  props: OfConnection,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q.from({ project: ai.projects }).select(({ project }) => ({
        ...project,
        connectionId: props.connectionId,
      })),
});

/** Every session of one Connection, each with its Connection. */
export const Sessions = Query.make('Sessions', {
  props: OfConnection,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q.from({ session: ai.sessions }).select(({ session }) => ({
        ...session,
        connectionId: props.connectionId,
      })),
});

export const ProjectRow = Query.make('ProjectRow', {
  props: OfProject,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ project: ai.projects })
        .where(({ project }) => eq(project.id, props.projectId)),
});

export const SessionRow = Query.make('SessionRow', {
  props: OfSession,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ session: ai.sessions })
        .where(({ session }) => eq(session.id, props.sessionId)),
});

export const Messages = Query.make('Messages', {
  props: OfSession,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ message: ai.messages })
        .where(({ message }) => eq(message.sessionId, props.sessionId)),
});

/**
 * The ids of one session's messages, and nothing else: its `where` opens
 * the session's Window as `Messages` does, so its messages sync, while its
 * Model, and Kabuki's History of it, hold only ids. A message that changes
 * in place, as a reply streams in, changes nothing it selects.
 */
export const MessageIds = Query.make('MessageIds', {
  props: OfSession,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ message: ai.messages })
        .where(({ message }) => eq(message.sessionId, props.sessionId))
        .select(({ message }) => ({ id: message.id })),
});

/**
 * Calls `changed` after each change to a Collection, a row taken away
 * included. TanStack DB tells a subscriber of a row taken away only if it
 * handed it that row first, which a subscriber that reads the rows itself
 * was never handed: so each is told it has seen them all.
 */
const onChange = (
  collection: {
    readonly subscribeChanges: (
      changed: () => void,
      options: { readonly includeInitialState: false },
    ) => { readonly unsubscribe: () => void };
  },
  changed: () => void,
) => collection.subscribeChanges(changed, { includeInitialState: false });

/** Every project and session the device holds of the Connections named. */
export interface Everything {
  readonly projects: ReadonlyArray<OnConnection<Project>>;
  readonly sessions: ReadonlyArray<OnConnection<Session>>;
}

/**
 * Every Project and Session the device holds of the Connections named now,
 * then again after each change to any, for a Worker: the Instances are
 * held while it runs.
 */
export const everything = (connectionIds: ReadonlyArray<string>) =>
  Stream.unwrap(
    Effect.map(instancesOf(connectionIds), (instances) =>
      Stream.callback<Everything>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const all = Object.entries(instances);
              const offer = () =>
                Queue.offerUnsafe(queue, {
                  projects: all.flatMap(([connectionId, ai]) =>
                    [...ai.projects.values()].map((each) => ({
                      ...each,
                      connectionId,
                    })),
                  ),
                  sessions: all.flatMap(([connectionId, ai]) =>
                    [...ai.sessions.values()].map((each) => ({
                      ...each,
                      connectionId,
                    })),
                  ),
                });
              offer();
              return all.flatMap(([, ai]) => [
                onChange(ai.projects, offer),
                onChange(ai.sessions, offer),
              ]);
            }),
            (subscriptions) =>
              Effect.sync(() => {
                for (const each of subscriptions) each.unsubscribe();
              }),
          ),
        // Changes while a reader is busy fold into the latest.
        { bufferSize: 1, strategy: 'sliding' },
      ),
    ),
  ).pipe(Stream.orDie);

/** Ends once the device holds the Session of one Connection with this id. */
export const arrival = (connectionId: string, sessionId: string) =>
  Stream.unwrap(
    Effect.map(CodeReplica.get(connectionId), (ai) =>
      Stream.callback<boolean>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const held = () => ai.sessions.get(sessionId) !== undefined;
              Queue.offerUnsafe(queue, held());
              return onChange(ai.sessions, () =>
                Queue.offerUnsafe(queue, held()),
              );
            }),
            // However it ends: there, timed out or stopped.
            (subscription) => Effect.sync(() => subscription.unsubscribe()),
          ),
        { bufferSize: 1, strategy: 'sliding' },
      ),
    ),
  ).pipe(
    Stream.filter((held) => held),
    Stream.runHead,
    Effect.asVoid,
    Effect.orDie,
  );

/**
 * A Session of one Connection and every Session it was forked from, nearest
 * first, as the device holds them now, then again after each change to
 * them, for a Worker; empty while it holds none. The chain ends at a
 * Session not forked, or one the device does not hold. A Fork is always
 * on its original's Connection.
 */
export const lineage = (connectionId: string, sessionId: string) =>
  Stream.unwrap(
    Effect.map(CodeReplica.get(connectionId), (ai) =>
      Stream.callback<ReadonlyArray<Session>>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const chain = () => {
                const found: Array<Session> = [];
                let at = ai.sessions.get(sessionId);
                while (at !== undefined && !found.includes(at)) {
                  found.push(at);
                  at =
                    at.forkedFrom === null
                      ? undefined
                      : ai.sessions.get(at.forkedFrom.sessionId);
                }
                return found;
              };
              let last = chain();
              Queue.offerUnsafe(queue, last);
              return onChange(ai.sessions, () => {
                const next = chain();
                // Only a change to one of them is news.
                if (
                  next.length === last.length &&
                  next.every((each, index) => each === last[index])
                )
                  return;
                last = next;
                Queue.offerUnsafe(queue, next);
              });
            }),
            (subscription) => Effect.sync(() => subscription.unsubscribe()),
          ),
        { bufferSize: 1, strategy: 'sliding' },
      ),
    ),
  ).pipe(Stream.orDie);
