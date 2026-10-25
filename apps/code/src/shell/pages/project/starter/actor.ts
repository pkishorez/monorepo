import { Effect, Layer, Schema, Stream } from 'effect';
import { type CodeClient, CodeClients } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation } from '@kestack/kabuki/routing';
import { Machines } from '../../../../layer/capabilities/index.ts';
import { Catalog, SharedCatalog } from '../capabilities/index.ts';
import { Draft } from '../draft/index.ts';

/*
 * A new session in a project, wherever it is shown, outside the project's
 * page: its Draft (`draft/`), with the catalog of agents, models and
 * Skills it chooses from read on the project's own Machine, as the
 * project's page reads it for its own. The Project Picker shows one in a
 * Drawer once a project is picked on touch.
 */

const Props = Schema.Struct({
  machineId: Schema.String,
  projectId: Schema.String,
  /** Its folder, as the Machine names it. */
  path: Schema.String,
});

const Starter = Actor.define('Starter', {
  requires: [CodeClients, Machines, Navigation],
  props: Props,
  model: Schema.Struct({ catalog: Catalog.Model }),
  message: Schema.TaggedUnion({
    Catalog: { change: Catalog.Change },
    CatalogRetryAsked: {},
  }),
});

/** Runs a read on the project's own Machine, over its own socket. */
const onMachine = <A, E>(
  self: { readonly get: Effect.Effect<{ readonly props: typeof Props.Type }> },
  read: Effect.Effect<A, E, CodeClient>,
) =>
  Effect.flatMap(self.get, ({ props }) =>
    CodeClients.on(props.machineId, read),
  );

export const StarterLive = Actor.build(Starter, {
  init: () => ({ model: { catalog: Catalog.empty } }),
  provides: (self) =>
    Layer.mergeAll(
      Layer.unwrap(
        Effect.map(self.get, ({ props }) =>
          CodeClients.machine(props.machineId),
        ),
      ),
      Layer.succeed(SharedCatalog, {
        changes: self.changes.pipe(
          Stream.map(({ model }) => model.catalog),
          Stream.changes,
        ),
        retry: self.send({ _tag: 'CatalogRetryAsked' }),
      }),
    ),
  workers: {
    harnesses: {
      while: ({ model }) => Catalog.wants.harnesses(model.catalog),
      run: (self) =>
        onMachine(self, Catalog.read.harnesses).pipe(
          Effect.flatMap((change) => self.send({ _tag: 'Catalog', change })),
        ),
    },
    models: {
      each: ({ model }) => Catalog.wants.models(model.catalog),
      run: (self, harness) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const change = yield* onMachine(
            self,
            Effect.gen(function* () {
              return yield* Catalog.read.models(model.catalog, harness);
            }),
          );
          yield* self.send({ _tag: 'Catalog', change });
        }),
    },
    skills: {
      each: ({ model }) => Catalog.wants.skills(model.catalog),
      run: (self, harness) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const change = yield* onMachine(
            self,
            Effect.gen(function* () {
              return yield* Catalog.read.skills(
                model.catalog,
                props.projectId,
                harness,
              );
            }),
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
    Catalog: ({ change }, { model }) => ({
      model: { ...model, catalog: Catalog.changed(model.catalog, change) },
    }),
    CatalogRetryAsked: (_, { model }) => ({
      model: {
        ...model,
        catalog: Catalog.changed(model.catalog, { _tag: 'Retry' }),
      },
    }),
  },
});
