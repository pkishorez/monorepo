import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { Kept, Machines } from '../../../../layer/capabilities/index.ts';
import { Catalog, SharedCatalog } from '../capabilities/index.ts';
import { Draft } from '../draft/index.ts';

/*
 * A new session in a project, wherever it is shown, outside the project's
 * page: its Draft (`draft/`), with the catalog of agents, models and
 * Skills it chooses from, from the project's own Machine's Kit and the
 * project's kept Skills, as the project's page keeps it for its own. The
 * Project Picker shows one in a Drawer once a project is picked on touch.
 */

const Props = Schema.Struct({
  machineId: Schema.String,
  projectId: Schema.String,
  /** Its folder, as the Machine names it. */
  path: Schema.String,
});

const Starter = Actor.define('Starter', {
  requires: [CodeClients, Machines, Kept, Navigation],
  props: Props,
  model: Schema.Struct({ catalog: Catalog.Keeper }),
  message: Schema.TaggedUnion({
    Catalog: { change: Catalog.Change },
    CatalogRetryAsked: {},
  }),
});

export const StarterLive = Actor.build(Starter, {
  init: () => ({ model: { catalog: Catalog.fresh } }),
  provides: (self) =>
    Layer.mergeAll(
      Layer.unwrap(
        Effect.map(self.get, ({ props }) =>
          CodeClients.machine(props.machineId),
        ),
      ),
      Layer.succeed(SharedCatalog, {
        changes: self.changes.pipe(
          Stream.map(({ model }) => Catalog.shared(model.catalog)),
          Stream.changesWith(Catalog.sameCatalog),
        ),
        retry: self.send({ _tag: 'CatalogRetryAsked' }),
      }),
    ),
  workers: {
    kit: {
      run: (self) =>
        Effect.flatMap(self.get, ({ props }) =>
          Stream.runForEach(Catalog.followKit(props.machineId), (change) =>
            self.send({ _tag: 'Catalog', change }),
          ),
        ),
    },
    saved: {
      while: ({ model }) => !model.catalog.skills.savedRead,
      run: (self) =>
        Effect.flatMap(self.get, ({ props }) =>
          Catalog.savedSkills(props.machineId, props.projectId).pipe(
            Effect.flatMap((change) => self.send({ _tag: 'Catalog', change })),
          ),
        ),
    },
    skills: {
      each: ({ model }) => Catalog.wants(model.catalog),
      run: (self, since) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const change = yield* CodeClients.on(
            props.machineId,
            Catalog.askSkills(
              props.projectId,
              Catalog.running(model.catalog.kit.harnesses),
              Number(since),
            ),
          );
          yield* self.send({ _tag: 'Catalog', change });
        }),
    },
  },
  children: {
    draft: {
      actor: Draft.actor,
      props: ({ props }) => ({
        machineId: props.machineId,
        projectId: props.projectId,
        to: { _tag: 'NewSession' as const },
      }),
    },
  },
  on: {
    Catalog: ({ change }, { model, props }) => {
      const { keeper, command } = Catalog.changed(model.catalog, change, props);
      return { model: { ...model, catalog: keeper }, command };
    },
    CatalogRetryAsked: (_, { model, props }) => {
      const { keeper, command } = Catalog.changed(
        model.catalog,
        { _tag: 'Retry' },
        props,
      );
      return { model: { ...model, catalog: keeper }, command };
    },
  },
});
