import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { across, Projects } from '../../machines/index.ts';
import { Machines } from '../../../layer/capabilities/index.ts';

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

const sameIds = Schema.toEquivalence(
  Schema.NullOr(Schema.Array(Schema.String)),
);

export const HomeLive = Page.build(Home, {
  init: () => ({ model: { machineIds: null } }),
  workers: {
    known: {
      run: (self) =>
        // Only their ids, so a line or a download changes nothing here.
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ machines }) => machines?.map(({ id }) => id) ?? null),
            Stream.changesWith(sameIds),
            Stream.runForEach((machineIds) =>
              self.send({ _tag: 'Known', machineIds }),
            ),
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
