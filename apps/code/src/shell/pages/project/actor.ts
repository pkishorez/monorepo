import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import {
  AccountReplicas,
  DeviceState,
  Kept,
  Machines,
  SavedDrafts,
} from '../../../layer/capabilities/index.ts';
import { home } from '../../routes/index.ts';
import { Refused, ProjectRow, removeProject } from '../../machines/index.ts';
import { Replicas } from '@kestack/std-toolkit/replica';
import {
  Catalog,
  SessionArrival,
  SharedCatalog,
} from './capabilities/index.ts';
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
 * 1. Catalog  the agents and their models, as its Machine's Kit holds
 *             them, and the project's Skills, kept and asked behind once
 *             it opens, shared with what is under it
 *             (`capabilities/catalog/`); what could not be read is asked
 *             again when asked.
 * 2. Draft    while no session is open, a new session's Draft (`draft/`),
 *             which starts one.
 * 3. Remove   asks first, then forgets the project, and all this device
 *             kept of it; its folder is never touched.
 */

const Model = Schema.Struct({
  /** Whether Cloud Connect has answered and no longer lists the Machine. */
  gone: Schema.Boolean,
  catalog: Catalog.Keeper,
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
  requires: [
    CodeClients,
    Machines,
    Navigation,
    Kept,
    SavedDrafts,
    AccountReplicas,
    DeviceState,
    Replicas,
  ],
  pages: { Session: Session.page },
  model: Model,
  message: Schema.TaggedUnion({
    MachineKnown: { gone: Schema.Boolean },
    ...Catalog.messages,
    ConfirmToggled: { open: Schema.Boolean },
    RemoveAsked: {},
    Removed: {},
    RemoveRefused: Refused,
  }),
});

/** 1. Catalog: kept for the Machine and project the URL names. */
const catalog = Catalog.keeping(
  ({ params }: { readonly params: Catalog.Where }) => params,
);

export const ProjectLive = Page.build(Project, {
  init: () => ({
    model: {
      gone: false,
      catalog: Catalog.fresh,
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
      Layer.succeed(SharedCatalog, catalog.shares(self)),
      // A new session its Draft asked for, its answer lost.
      Layer.unwrap(
        Effect.map(self.get, ({ props }) =>
          SessionArrival.machine(props.params.machineId),
        ),
      ),
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
    ...catalog.workers,
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
    ...catalog.on,
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
