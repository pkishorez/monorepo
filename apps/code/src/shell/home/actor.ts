import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { across, Projects } from '../../replica/index.ts';
import { Machines } from '../machines/index.ts';

/*
 * The home page: every Machine's projects to pick from, and the way to the
 * Project Picker, the only thing to do while there are none. It reads the
 * Machine List for which Machines to read; with none listed, the root
 * says how to start one.
 */

export const Home = Page.define({
  path: '/',
  requires: [Machines],
  metadata: { title: 'Projects · code' },
  model: Schema.Struct({
    /** The listed Machines' ids; null before any list. */
    machineIds: Schema.NullOr(Schema.Array(Schema.String)),
  }),
  message: Schema.TaggedUnion({
    Known: { machineIds: Schema.NullOr(Schema.Array(Schema.String)) },
  }),
});

export const HomeLive = Page.build(Home, {
  init: () => ({ model: { machineIds: null } }),
  workers: {
    known: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          Stream.runForEach(state, ({ machines }) =>
            self.send({
              _tag: 'Known',
              machineIds: machines?.map(({ id }) => id) ?? null,
            }),
          ),
        ),
    },
  },
  children: {
    projects: {
      actor: Projects,
      each: ({ model }) => across.each(model.machineIds ?? []),
      props: (_, key) => across.props(key),
    },
  },
  on: {
    Known: ({ machineIds }) => ({ model: { machineIds } }),
  },
});
