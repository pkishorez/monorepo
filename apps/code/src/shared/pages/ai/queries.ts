import { eq } from '@tanstack/db';
import { Effect, Schema } from 'effect';
import { Ai } from '@kestack/ai-toolkit/client';
import { Query } from '@kestack/std-toolkit/replica';

/*
 * What the pages read from the server, as Queries over the one `Ai`
 * Instance. Projects and sessions sync whole while the app runs; a
 * session's messages sync only while `Messages` filters on its id, which
 * opens that session's Window.
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
