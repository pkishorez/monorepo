import { eq } from '@tanstack/db';
import { Effect, Queue, Schema, Stream } from 'effect';
import { CodeReplica, type Project, type Session } from '@kestack/connect/code';
import { Query } from '@kestack/std-toolkit/replica';

/*
 * What the pages read of the Machines, as Queries over their `CodeReplica`
 * Instances, `CodeReplica.get(machineId)`, one per Machine, each syncing over its
 * own Machine's socket. `Projects` and `Sessions` read one Machine each,
 * placed one per Machine (`across`), and each row says which Machine it is
 * from; a row, or a session's messages, are read from the one Machine its
 * address names.
 * Projects and sessions sync whole while the app runs; a session's
 * messages sync only while `Messages` filters on its id, which opens that
 * session's Window; `MessageIds` opens it the same way and keeps only the
 * ids, for a Window held open with nothing drawn. `everything` follows every project and session for a
 * Worker, which hands them to a Picker while it is open, `lineage` one
 * session and the ones it was forked from, for a page's Worker, and
 * `arrival` waits for one session to be held. Where the user moves a
 * session, on its way to its Machine, is `moves/`.
 */

/** A record as read from one Machine: its own fields, and the Machine's id. */
export type OnMachine<A> = A & { readonly machineId: string };

const OfMachine = Schema.Struct({ machineId: Schema.String });
const OfProject = Schema.Struct({
  machineId: Schema.String,
  projectId: Schema.String,
});
const OfSession = Schema.Struct({
  machineId: Schema.String,
  sessionId: Schema.String,
});

/**
 * A Query of one Machine, placed as an `each` Child: one key per Machine,
 * its id, so a Machine read stays read, its rows with it, whatever the list
 * of Machines around it does.
 */
export const across = {
  each: (machineIds: ReadonlyArray<string>) => machineIds,
  props: (machineId: string) => ({ machineId }),
};

/** The Instance of each Machine named, by Machine id. */
const instancesOf = (machineIds: ReadonlyArray<string>) =>
  Effect.map(
    Effect.forEach(machineIds, (machineId) =>
      Effect.map(CodeReplica.get(machineId), (ai) => [machineId, ai] as const),
    ),
    (pairs) => Object.fromEntries(pairs),
  );

/** One Machine's Instance, as a Query reads it. */
const one = ({ props }: { readonly props: { readonly machineId: string } }) =>
  Effect.all({ ai: CodeReplica.get(props.machineId) });

/** The name a Query's `neverSynced` gives a Machine's Instance. */
export const instanceOf = (machineId: string) =>
  CodeReplica.instanceName(machineId);

/** Every project of one Machine, each with its Machine. */
export const Projects = Query.make('Projects', {
  props: OfMachine,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ project: ai.projects })
        .select(({ project }) => ({ ...project, machineId: props.machineId })),
});

/** Every session of one Machine, each with its Machine. */
export const Sessions = Query.make('Sessions', {
  props: OfMachine,
  from: one,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ session: ai.sessions })
        .select(({ session }) => ({ ...session, machineId: props.machineId })),
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

/** Every project and session the device holds of the Machines named. */
export interface Everything {
  readonly projects: ReadonlyArray<OnMachine<Project>>;
  readonly sessions: ReadonlyArray<OnMachine<Session>>;
}

/**
 * Every Project and Session the device holds of the Machines named now,
 * then again after each change to any, for a Worker: the Instances are
 * held while it runs.
 */
export const everything = (machineIds: ReadonlyArray<string>) =>
  Stream.unwrap(
    Effect.map(instancesOf(machineIds), (instances) =>
      Stream.callback<Everything>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              const all = Object.entries(instances);
              const offer = () =>
                Queue.offerUnsafe(queue, {
                  projects: all.flatMap(([machineId, ai]) =>
                    [...ai.projects.values()].map((each) => ({
                      ...each,
                      machineId,
                    })),
                  ),
                  sessions: all.flatMap(([machineId, ai]) =>
                    [...ai.sessions.values()].map((each) => ({
                      ...each,
                      machineId,
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

/** Ends once the device holds the Session of one Machine with this id. */
export const arrival = (machineId: string, sessionId: string) =>
  Stream.unwrap(
    Effect.map(CodeReplica.get(machineId), (ai) =>
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
 * A Session of one Machine and every Session it was forked from, nearest
 * first, as the device holds them now, then again after each change to
 * them, for a Worker; empty while it holds none. The chain ends at a
 * Session not forked, or one the device does not hold. A Fork is always
 * on its original's Machine.
 */
export const lineage = (machineId: string, sessionId: string) =>
  Stream.unwrap(
    Effect.map(CodeReplica.get(machineId), (ai) =>
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
