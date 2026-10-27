import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients } from '@kestack/connect/code';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import {
  Sync,
  Cache,
  SavedDrafts,
  Seen,
} from '../../../machine/store/index.ts';
import { Preferences } from '../../../../../store.ts';
import { Machines } from '../../../machines.ts';
import { Storage } from '../../../../store/index.ts';
import { home } from '../../../../../routes/index.ts';
import { Refused } from '../../../machine/connection/index.ts';
import { ProjectRow } from '../../../machine/records/index.ts';
import { removeProject } from '../../../machine/index.ts';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Draft } from './draft/index.ts';
import * as Catalog from './store.ts';
import { SessionArrival, SharedCatalog } from './store.ts';
import { Session } from './session/index.ts';

/*
 * A project: a new session in it, and the session open under it, if the
 * URL names one.
 *
 * 0. Machine  the project's own Machine, `:machineId`: its `CodeClient`,
 *             over its own socket, Provided to what is under it; its own
 *             reads and errands go over the same socket. A Machine the
 *             Account's list no longer has says so in place of the page.
 * 1. Catalog  the agents and their models, as its Machine's setup holds
 *             them, and the project's Skills, kept and asked behind once
 *             it opens, shared with what is under it (`store.ts`); what
 *             could not be read is asked again when asked.
 * 2. Draft    while no session is open, a new session's Draft (`draft/`),
 *             which starts one, drawn as a new session (`new-session/`);
 *             with one open, the Session (`session/`).
 * 3. Remove   asks first, then forgets the project, and all this device
 *             kept of it; its folder is never touched.
 * 4. Ready    it is drawn whole once read from this device (`readyOf`):
 *             its row, and the new session's Saved Draft, so the words and
 *             the Draft come in one step; or the Session open, whole. Its
 *             View says so for the place in it the app first loads at, a
 *             new session or a Session (`placeIn`), so Layout is first
 *             drawn whole.
 */

const Model = Schema.Struct({
  /** Whether Cloud Connect has answered and no longer lists the Machine. */
  gone: Schema.Boolean,
  /** Whether the Machine is off the list as read here, kept or answered: nothing of it is read here. */
  unlisted: Schema.Boolean,
  catalog: Catalog.Keeper,
  removal: Schema.Struct({
    confirming: Schema.Boolean,
    removing: Schema.Boolean,
    problem: Schema.NullOr(Schema.String),
  }),
  /**
   * The place in it last drawn whole, from this device (4. Ready): a
   * Session's id, or empty for a new session; null before any.
   */
  ready: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

// 4. Ready
/** The place in a project: the Session open, or empty for a new session. */
export const placeIn = (page: { readonly sessionId: string } | undefined) =>
  page?.sessionId ?? '';

/**
 * Whether the project can be drawn whole: with a Session open, that
 * Session's word; else its row read from this device and, for a row held
 * here, its new session's Saved Draft read back. A row not held here is
 * drawn as it is until its Machine answers; a Machine off the Account's
 * list has nothing here to read, so its page is drawn as it is at once.
 */
export const readyOf = ({
  unlisted,
  found,
  session,
  restored,
}: {
  /** The Machine is off the Account's list: nothing of it is read here. */
  readonly unlisted: boolean;
  /** Its row's Query, and whether it holds the row. */
  readonly found:
    | {
        readonly status: 'loading' | 'ready' | 'failed';
        readonly held: boolean;
      }
    | undefined;
  /** Whether the Session open can be drawn whole; undefined with none open. */
  readonly session: boolean | undefined;
  /** Whether its new session's Saved Draft is read back. */
  readonly restored: boolean | undefined;
}) =>
  unlisted
    ? true
    : session !== undefined
      ? session
      : found !== undefined &&
        found.status !== 'loading' &&
        (!found.held || restored === true);

export const Project = Page.define({
  path: '/m/:machineId/p/:projectId',
  params: { machineId: Schema.String, projectId: Schema.String },
  metadata: { title: 'Project · code' },
  requires: [
    CodeClients,
    Machines,
    Navigation,
    Cache,
    SavedDrafts,
    Seen,
    Storage,
    Sync,
    Preferences,
    Replicas,
  ],
  pages: { Session: Session.page },
  model: Model,
  message: Schema.TaggedUnion({
    MachineKnown: { gone: Schema.Boolean, unlisted: Schema.Boolean },
    ...Catalog.messages,
    ConfirmToggled: { open: Schema.Boolean },
    RemoveAsked: {},
    Removed: {},
    RemoveRefused: Refused,
    /** All it draws at `at` (`placeIn`) is read from this device: it can be drawn whole. */
    Ready: { at: Schema.String },
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
      unlisted: false,
      catalog: Catalog.fresh,
      removal: { confirming: false, removing: false, problem: null },
      ready: null,
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
            Stream.map(({ machines, fetchedAt, savedRead }) => {
              const off =
                machines?.some(({ id }) => id === props.params.machineId) !==
                true;
              return {
                gone: fetchedAt !== null && off,
                unlisted: (savedRead || fetchedAt !== null) && off,
              };
            }),
            Stream.changesWith(
              (a, b) => a.gone === b.gone && a.unlisted === b.unlisted,
            ),
            Stream.runForEach((known) =>
              self.send({ _tag: 'MachineKnown', ...known }),
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
    MachineKnown: ({ gone, unlisted }, { model }) => ({
      model: { ...model, gone, unlisted },
    }),
    // 4. Ready, at each place in it.
    Ready: ({ at }, { model }) =>
      model.ready === at ? {} : { model: { ...model, ready: at } },
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
