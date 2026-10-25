import { Effect, Layer, Schema, Stream } from 'effect';
import { type CodeClient, CodeClients } from '@kestack/connect/code';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Machines } from '../../../layer/capabilities/index.ts';
import { home } from '../../routes/index.ts';
import { Refused, ProjectRow } from '../../machines/index.ts';
import { Catalog, SharedCatalog } from './capabilities/index.ts';
import { removeProject } from './commands.ts';
import { Draft } from './draft/index.ts';
import { Session } from './session/index.ts';

/*
 * A project: a new session in it, and the session open under it, if the
 * URL names one.
 *
 * 0. Machine  the project's own Machine, `:machineId`: its `CodeClient`,
 *             over its own socket, Provided to what is under it; its own
 *             reads and errands go over the same socket. A Machine the
 *             Account's list no longer has says so in place of the page.
 * 1. Catalog  the agents, their models and Skills, read once while the
 *             project is open, and shared with what is under it
 *             (`capabilities/catalog/`); what could not be read is read
 *             again when asked.
 * 2. Draft    while no session is open, a new session's Draft (`draft/`),
 *             which starts one.
 * 3. Remove   asks first, then forgets the project; its folder is never
 *             touched.
 */

const Model = Schema.Struct({
  /** Whether Cloud Connect has answered and no longer lists the Machine. */
  gone: Schema.Boolean,
  catalog: Catalog.Model,
  removal: Schema.Struct({
    confirming: Schema.Boolean,
    removing: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
});
type Model = typeof Model.Type;

export const Project = Page.define({
  path: '/m/:machineId/p/:projectId',
  params: { machineId: Schema.String, projectId: Schema.String },
  metadata: { title: 'Project · code' },
  requires: [CodeClients, Machines, Navigation],
  pages: { Session: Session.page },
  model: Model,
  message: Schema.TaggedUnion({
    MachineKnown: { gone: Schema.Boolean },
    Catalog: { change: Catalog.Change },
    CatalogRetryAsked: {},
    ConfirmToggled: { open: Schema.Boolean },
    RemoveAsked: {},
    Removed: {},
    RemoveRefused: Refused,
  }),
});

/** Runs a read on the project's own Machine, over its own socket. */
const onMachine = <A, E>(
  self: {
    readonly get: Effect.Effect<{
      readonly props: { readonly params: { readonly machineId: string } };
    }>;
  },
  read: Effect.Effect<A, E, CodeClient>,
) =>
  Effect.flatMap(self.get, ({ props }) =>
    CodeClients.on(props.params.machineId, read),
  );

const retried = (model: Model) => ({
  ...model,
  catalog: Catalog.changed(model.catalog, { _tag: 'Retry' }),
});

export const ProjectLive = Page.build(Project, {
  init: () => ({
    model: {
      gone: false,
      catalog: Catalog.empty,
      removal: { confirming: false, removing: false, problem: null },
    },
  }),
  pages: { Session: Session.actor },
  provides: (self) =>
    Layer.mergeAll(
      // 0. Machine: its own `CodeClient`, for what is under it.
      Layer.unwrap(
        Effect.map(self.get, ({ props }) =>
          CodeClients.machine(props.params.machineId),
        ),
      ),
      // 1. Catalog, for the pages under it.
      Layer.succeed(SharedCatalog, {
        changes: self.changes.pipe(
          Stream.map(({ model }) => model.catalog),
          Stream.changes,
        ),
        retry: self.send({ _tag: 'CatalogRetryAsked' }),
      }),
    ),
  workers: {
    // 0. Machine: whether the Account's list still has it.
    machine: {
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const { state } = yield* Machines;
          yield* state.pipe(
            Stream.map(
              ({ machines, fetchedAt }) =>
                fetchedAt !== null &&
                machines?.some(({ id }) => id === props.params.machineId) !==
                  true,
            ),
            Stream.changes,
            Stream.runForEach((gone) =>
              self.send({ _tag: 'MachineKnown', gone }),
            ),
          );
        }),
    },
    // 1. Catalog
    harnesses: {
      while: ({ model }) => Catalog.wants.harnesses(model.catalog),
      run: (self) =>
        onMachine(self, Catalog.read.harnesses).pipe(
          Effect.flatMap((change) => self.send({ _tag: 'Catalog', change })),
        ),
    },
    models: {
      each: ({ model }) => Catalog.wants.models(model.catalog),
      run: (self, account) =>
        Effect.gen(function* () {
          const { model } = yield* self.get;
          const change = yield* onMachine(
            self,
            Effect.gen(function* () {
              return yield* Catalog.read.models(model.catalog, account);
            }),
          );
          yield* self.send({ _tag: 'Catalog', change });
        }),
    },
    skills: {
      each: ({ model }) => Catalog.wants.skills(model.catalog),
      run: (self, account) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const change = yield* onMachine(
            self,
            Effect.gen(function* () {
              return yield* Catalog.read.skills(
                model.catalog,
                props.params.projectId,
                account,
              );
            }),
          );
          yield* self.send({ _tag: 'Catalog', change });
        }),
    },
  },
  children: {
    project: {
      actor: ProjectRow,
      props: ({ props }) => ({
        machineId: props.params.machineId,
        projectId: props.params.projectId,
      }),
    },
    // 2. Draft, while no session is open over it.
    draft: {
      actor: Draft.actor,
      while: ({ props }) => props.route.page === undefined,
      props: ({ props }) => ({
        machineId: props.params.machineId,
        projectId: props.params.projectId,
        to: { _tag: 'NewSession' as const },
      }),
    },
  },
  on: {
    MachineKnown: ({ gone }, { model }) => ({ model: { ...model, gone } }),
    Catalog: ({ change }, { model }) => ({
      model: { ...model, catalog: Catalog.changed(model.catalog, change) },
    }),
    CatalogRetryAsked: (_, { model }) => ({ model: retried(model) }),
    // 3. Remove
    ConfirmToggled: ({ open }, { model }) =>
      model.removal.removing
        ? {}
        : {
            model: {
              ...model,
              removal: { confirming: open, removing: false, problem: null },
            },
          },
    RemoveAsked: (_, { model, props }) =>
      model.removal.removing
        ? {}
        : {
            model: {
              ...model,
              removal: { ...model.removal, removing: true },
            },
            command: removeProject({
              machineId: props.params.machineId,
              id: props.params.projectId,
            }),
          },
    Removed: (_, { model }) => ({
      model: {
        ...model,
        removal: { confirming: false, removing: false, problem: null },
      },
      command: Router.push(home()),
    }),
    RemoveRefused: ({ reason }, { model }) => ({
      model: {
        ...model,
        removal: { ...model.removal, removing: false, problem: reason },
      },
    }),
  },
});
