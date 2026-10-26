import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Machines } from '../../../layer/capabilities/index.ts';
import { ProjectRow, SessionRow } from '../../machines/index.ts';

/*
 * What the header reads: the rows of the project and the session the URL
 * names, and the names of its Machine's Harness Accounts, as its Kit
 * holds them, to say which one the session runs as; nothing else, so a
 * change to any other draws nothing here.
 */

const Names = Schema.Record(Schema.String, Schema.String);
const sameNames = Schema.toEquivalence(Names);

const Header = Actor.define('Header', {
  requires: [Machines],
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
  model: Schema.Struct({
    /** The open project's Machine's Harness Accounts' names, by id. */
    names: Names,
  }),
  message: Schema.TaggedUnion({ Named: { names: Names } }),
});

export const HeaderLive = Actor.build(Header, {
  init: () => ({ model: { names: {} } }),
  workers: {
    names: {
      each: ({ props }) =>
        props.place === null ? [] : [props.place.machineId],
      run: (self, machineId) =>
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ kits }) =>
              Object.fromEntries(
                (kits[machineId]?.harnesses ?? []).map(({ account, name }) => [
                  account,
                  name,
                ]),
              ),
            ),
            Stream.changesWith(sameNames),
            Stream.runForEach((names) => self.send({ _tag: 'Named', names })),
          ),
        ),
    },
  },
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
  on: {
    Named: ({ names }, { model }) => ({ model: { ...model, names } }),
  },
});
