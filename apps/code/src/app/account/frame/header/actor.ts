import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { ProjectRow, SessionRow } from '../../connection/records/index.ts';
import { Voice } from './voice/index.ts';

/*
 * The header, over every page while the Account is `Active`: where you
 * are, and Voice, whose cancel it shows while a Dictation is going.
 *
 * 1. Rows   the rows of the project and the session the URL names,
 *           nothing else, so a change to any other draws nothing here;
 *           its title draws them (`header.tsx`). The session's agent and
 *           model are the Draft's to say.
 * 2. Voice  recording from anywhere (`voice/`). It lives as long as the
 *           header, around every page, so a recording carries on while
 *           the user moves between pages, Settings too.
 * 3. Read   until the frame is first shown, its View says which of its
 *           rows are read from this device (`rowRead`), for the frame to
 *           wait on: never the row of the place before, which a Query
 *           still holds for a moment after the URL moved.
 */

// 3. Read
/** A row as its Query reads it: the id it asks for, and the row's it holds. */
export interface RowRead {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly asked: string;
  readonly held: string | undefined;
}

/**
 * Whether a row is read for `wanted`, the id the URL names: none named,
 * or its Query asks for that id, is not loading, and holds no other row,
 * as it may for a moment after the URL moved.
 */
export const rowRead = (wanted: string | null, row: RowRead | undefined) =>
  wanted === null ||
  (row !== undefined &&
    row.asked === wanted &&
    row.status !== 'loading' &&
    (row.held === undefined || row.held === wanted));

/** The project open, and the session open in it, if any. */
const Place = Schema.NullOr(
  Schema.Struct({
    connectionId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.NullOr(Schema.String),
  }),
);

/** The ids whose rows are read from this device: none while not. */
const Read = Schema.Struct({
  project: Schema.NullOr(Schema.String),
  session: Schema.NullOr(Schema.String),
});

const Header = Actor.define('Header', {
  props: Schema.Struct({ place: Place }),
  model: Schema.Struct({
    /** Which of its rows are read, as its View last said (3. Read). */
    read: Read,
  }),
  message: Schema.TaggedUnion({
    RowsRead: Read.fields,
  }),
});

export const HeaderLive = Header.build({
  init: () => ({ model: { read: { project: null, session: null } } }),
  children: {
    // 1. Rows
    project: Actor.child(ProjectRow, {
      while: ({ props }) => props.place !== null,
      props: ({ props }) => ({
        connectionId: props.place?.connectionId ?? '',
        projectId: props.place?.projectId ?? '',
      }),
    }),
    session: Actor.child(SessionRow, {
      while: ({ props }) => props.place?.sessionId != null,
      props: ({ props }) => ({
        connectionId: props.place?.connectionId ?? '',
        sessionId: props.place?.sessionId ?? '',
      }),
    }),
    // 2. Voice
    voice: Actor.child(Voice.actor),
  },
  on: {
    // 3. Read
    RowsRead: (read, { model }) =>
      model.read.project === read.project && model.read.session === read.session
        ? {}
        : {
            model: {
              ...model,
              read: { project: read.project, session: read.session },
            },
          },
  },
});
