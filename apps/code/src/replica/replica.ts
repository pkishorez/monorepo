import { eq } from '@tanstack/db';
import { Effect, Queue, Schema, Stream } from 'effect';
import type { Project, Session } from '@kestack/ai-toolkit/api';
import { Ai } from '@kestack/ai-toolkit/client';
import { Query } from '@kestack/std-toolkit/replica';

/*
 * What the pages read from the server, as Queries over the one `Ai`
 * Instance. Projects and sessions sync whole while the app runs; a
 * session's messages sync only while `Messages` filters on its id, which
 * opens that session's Window. `everything` follows every project and
 * session for a Worker, which hands them to a Picker while it is open, and
 * `lineage` one session and the ones it was forked from, for a page's
 * Worker.
 */

const None = Schema.Struct({});
const OfProject = Schema.Struct({ projectId: Schema.String });
const OfSession = Schema.Struct({ sessionId: Schema.String });

const ai = () => Effect.all({ ai: Ai.get() });

export const Projects = Query.make('Projects', {
  props: None,
  from: ai,
  query:
    (_, { ai }) =>
    (q) =>
      q.from({ project: ai.projects }),
});

export const Sessions = Query.make('Sessions', {
  props: None,
  from: ai,
  query:
    (_, { ai }) =>
    (q) =>
      q.from({ session: ai.sessions }),
});

export const ProjectRow = Query.make('ProjectRow', {
  props: OfProject,
  from: ai,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ project: ai.projects })
        .where(({ project }) => eq(project.id, props.projectId)),
});

export const ProjectSessions = Query.make('ProjectSessions', {
  props: OfProject,
  from: ai,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ session: ai.sessions })
        .where(({ session }) => eq(session.projectId, props.projectId)),
});

export const SessionRow = Query.make('SessionRow', {
  props: OfSession,
  from: ai,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ session: ai.sessions })
        .where(({ session }) => eq(session.id, props.sessionId)),
});

export const Messages = Query.make('Messages', {
  props: OfSession,
  from: ai,
  query:
    ({ props }, { ai }) =>
    (q) =>
      q
        .from({ message: ai.messages })
        .where(({ message }) => eq(message.sessionId, props.sessionId)),
});

/**
 * Every Project and Session the device holds now, then again after each
 * change to either, for a Worker: the Instance is held while it runs.
 */
export const everything = Stream.unwrap(
  Effect.map(Ai.get(), (ai) =>
    Stream.callback<{
      readonly projects: ReadonlyArray<Project>;
      readonly sessions: ReadonlyArray<Session>;
    }>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const offer = () =>
              Queue.offerUnsafe(queue, {
                projects: [...ai.projects.values()],
                sessions: [...ai.sessions.values()],
              });
            offer();
            return [
              ai.projects.subscribeChanges(offer),
              ai.sessions.subscribeChanges(offer),
            ];
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

/**
 * A Session and every Session it was forked from, nearest first, as the
 * device holds them now, then again after each change to them, for a
 * Worker; empty while it holds none. The chain ends at a Session not
 * forked, or one the device does not hold.
 */
export const lineage = (sessionId: string) =>
  Stream.unwrap(
    Effect.map(Ai.get(), (ai) =>
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
              return ai.sessions.subscribeChanges(() => {
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
