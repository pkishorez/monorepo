import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { ProjectRow, SessionRow } from '../../replica/index.ts';

/*
 * What the header reads: the rows of the project and the session the URL
 * names, and nothing else, so a change to any other draws nothing here.
 */

const Header = Actor.define('Header', {
  props: Schema.Struct({
    /** The project open, and the session open in it, if any. */
    place: Schema.NullOr(
      Schema.Struct({
        machineId: Schema.String,
        projectId: Schema.String,
        sessionId: Schema.NullOr(Schema.String),
      }),
    ),
  }),
});

export const HeaderLive = Actor.build(Header, {
  children: {
    project: {
      actor: ProjectRow,
      while: ({ props }) => props.place !== null,
      props: ({ props }) => ({
        machineId: props.place?.machineId ?? '',
        projectId: props.place?.projectId ?? '',
      }),
    },
    session: {
      actor: SessionRow,
      while: ({ props }) => props.place?.sessionId != null,
      props: ({ props }) => ({
        machineId: props.place?.machineId ?? '',
        sessionId: props.place?.sessionId ?? '',
      }),
    },
  },
});
