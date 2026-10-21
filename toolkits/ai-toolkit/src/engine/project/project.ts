import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { ProjectSchema } from '../../records/index.js';
import { Session, SessionInput } from './session/index.js';

/*
 * A Project: a folder, and one Session child for each of its sessions. A
 * new session starts here, already running its first message.
 */

const ProjectRecord = Schema.Struct(ProjectSchema.fields);

/** Each Session as it was first handed over; the Session keeps itself after. */
const Started = Schema.Struct({
  session: SessionInput.fields.session,
  first: SessionInput.fields.first,
});

export const ProjectInput = Schema.Struct({
  project: ProjectRecord,
  sessions: Schema.Array(Started),
});
export type ProjectInput = typeof ProjectInput.Type;

const Message = Schema.TaggedUnion({
  StartSession: {
    session: SessionInput.fields.session,
    text: Schema.String,
    turnId: Schema.String,
  },
});

export const Project = Actor.build(
  Actor.define('Project', {
    input: ProjectInput,
    model: ProjectInput,
    message: Message,
  }),
  {
    init: (input) => ({ model: input }),
    on: {
      StartSession: ({ session, text, turnId }, { model }) => ({
        model: {
          ...model,
          sessions: [...model.sessions, { session, first: { text, turnId } }],
        },
      }),
    },
    children: {
      sessions: {
        actor: Session,
        each: ({ model }) => model.sessions.map(({ session }) => session.id),
        input: ({ model }, id) => {
          const started = model.sessions.find(
            ({ session }) => session.id === id,
          )!;
          return { ...started, cwd: model.project.path };
        },
      },
    },
  },
);
