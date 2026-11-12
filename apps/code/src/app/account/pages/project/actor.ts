import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { Preferences, Storage } from '../../../storage/index.ts';
import { Connections } from '../../account.ts';
import { accountIn, home } from '../../../app.ts';
import { Refused } from '../../connection/link/index.ts';
import {
  ProjectRow,
  readingOf,
  runsAfter,
} from '../../connection/records/index.ts';
import { borrowed, removeProject } from '../../connection/index.ts';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Draft } from './draft/index.ts';
import * as Catalog from './store.ts';
import { Handover, SessionArrival, SharedCatalog } from './store.ts';
import { Session } from './session/index.ts';
import { Actor } from '@kestack/kabuki';

/*
 * A project: a new session in it, and the session open under it, if the
 * URL names one.
 *
 * 0. Connection  the project's own Connection, `:connectionId`: its `CodeClient`,
 *             borrowed from the Connection while it runs, over the socket
 *             the Connection owns, Provided to what is under it; its own
 *             reads and errands go over the same socket. The page holds
 *             none of its own. A Connection the
 *             Account's list no longer has says so in place of the page.
 *             Each time the Connection runs here again, once the Account is
 *             the one active again, its row's Query starts over, so it
 *             reads the Connection's records anew.
 * 1. Catalog  the agents and their models, as its Connection's setup holds
 *             them, and the project's Skills, kept and asked behind once
 *             it opens, shared with what is under it (`store.ts`); what
 *             could not be read is asked again when asked.
 * 2. Draft    while no session is open, a new session's Draft (`draft/`),
 *             which starts one, drawn as a new session (`NewSession`, in
 *             the View);
 *             with one open, the Session (`session/`). A Session the
 *             Draft started is handed over (`Handover`): the Draft, and
 *             its Starting, stay drawn until the Session's page can be
 *             drawn whole, so nothing blank comes between them, or for
 *             ten seconds at most, its row never synced.
 * 3. Remove   asks first, then forgets the project, and all this device
 *             kept of it; its folder is never touched.
 * 4. Ready    it is drawn whole once read from this device (`readyOf`):
 *             its row, and the new session's Saved Draft, so the words and
 *             the Draft come in one step; or the Session open, whole. Its
 *             View says so for the place in it the app first loads at, a
 *             new session or a Session (`placeIn`), so the frame is first
 *             drawn whole.
 */

const Model = Schema.Struct({
  /** Whether Cloud Connect has answered and no longer lists the Connection. */
  gone: Schema.Boolean,
  /** Whether the Connection is off the list as read here, kept or answered: nothing of it is read here. */
  unlisted: Schema.Boolean,
  /** Whether the Connection runs here: the Account is the one active, and lists it. */
  here: Schema.Boolean,
  /** How many times the Connection started running here while the page was open (0. Connection). */
  runs: Schema.Finite,
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
  /** The Session its Draft started, until its page is drawn whole (2. Draft). */
  handover: Schema.NullOr(Schema.String),
});
type Model = typeof Model.Type;

// 4. Ready
/** The place in a project: the Session open, or empty for a new session. */
export const placeIn = (page: { readonly sessionId: string } | undefined) =>
  page?.sessionId ?? '';

// 2. Draft
/**
 * Whether the new session's Draft is kept: while no Session is open, and,
 * once one it started is open, until that one is drawn whole (`Handover`).
 */
export const drafting = (
  page: { readonly sessionId: string } | undefined,
  handover: string | null,
) => page === undefined || placeIn(page) === handover;

/** Drawn whole at `at`: a Session handed over there is no longer waited for. */
export const readyAt = ({ handover }: Pick<Model, 'handover'>, at: string) => ({
  ready: at,
  handover: handover === at ? null : handover,
});

/**
 * Whether the project can be drawn whole: with a Session open, that
 * Session's word; else its row read from this device and, for a row held
 * here, its new session's Saved Draft read back. A row not held here is
 * drawn as it is until its Connection answers; a Connection off the Account's
 * list has nothing here to read, so its page is drawn as it is at once.
 */
export const readyOf = ({
  unlisted,
  found,
  session,
  restored,
}: {
  /** The Connection is off the Account's list: nothing of it is read here. */
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
  path: '/m/:connectionId/p/:projectId',
  params: { connectionId: Schema.String, projectId: Schema.String },
  metadata: { title: 'Project · code' },
  requires: [
    CodeClients,
    Connections,
    Navigation,
    Storage,
    Preferences,
    Replicas,
  ],
  pages: { Session: Session.page },
  model: Model,
  message: Schema.TaggedUnion({
    ConnectionKnown: {
      gone: Schema.Boolean,
      unlisted: Schema.Boolean,
      here: Schema.Boolean,
    },
    ...Catalog.messages,
    ConfirmToggled: { open: Schema.Boolean },
    RemoveAsked: {},
    Removed: {},
    RemoveRefused: Refused,
    /** All it draws at `at` (`placeIn`) is read from this device: it can be drawn whole. */
    Ready: { at: Schema.String },
    /** Its Draft started the Session `sessionId`, and moves to it. */
    HandedOver: { sessionId: Schema.String },
  }),
});

/** 1. Catalog: kept for the Connection and project the URL names. */
const catalog = Catalog.keeping(
  ({ params }: { readonly params: Catalog.Where }) => params,
);

export const ProjectLive = Project.build({
  init: () => ({
    model: {
      gone: false,
      unlisted: false,
      here: false,
      runs: 0,
      catalog: Catalog.fresh,
      removal: { confirming: false, removing: false, problem: null },
      ready: null,
      handover: null,
    },
  }),
  pages: { Session: Session.actor },
  provides: {
    capabilities: [
      CodeClient,
      RpcConnection,
      SharedCatalog,
      SessionArrival,
      Handover,
    ],
    layer: (self) =>
      Layer.mergeAll(
        // 0. Connection: its Connection's `CodeClient`, borrowed while the
        // Connection runs, for what is under it.
        Layer.unwrap(
          Effect.map(self.get, ({ props }) =>
            borrowed(props.params.connectionId),
          ),
        ),
        // 1. Catalog, for the pages under it.
        Layer.succeed(SharedCatalog, catalog.shares(self)),
        // A new session its Draft asked for, its answer lost.
        Layer.unwrap(
          Effect.map(self.get, ({ props }) =>
            SessionArrival.connection(props.params.connectionId),
          ),
        ),
        // 2. Draft: a new session it started, kept drawn until it is ready.
        Layer.succeed(
          Handover,
          Handover.of({
            started: (sessionId) =>
              self.send({ _tag: 'HandedOver', sessionId }),
          }),
        ),
      ),
  },
  workers: {
    // 0. Connection: whether the Account's list still has it.
    connection: {
      run: (self) =>
        Effect.gen(function* () {
          const { props } = yield* self.get;
          const { state } = yield* Connections;
          yield* state.pipe(
            Stream.map(({ connections, fetchedAt, savedRead }) => {
              const off =
                connections?.some(
                  ({ id }) => id === props.params.connectionId,
                ) !== true;
              return {
                gone: fetchedAt !== null && off,
                unlisted: (savedRead || fetchedAt !== null) && off,
                here: !off,
              };
            }),
            Stream.changesWith(
              (a, b) =>
                a.gone === b.gone &&
                a.unlisted === b.unlisted &&
                a.here === b.here,
            ),
            Stream.runForEach((known) =>
              self.send({ _tag: 'ConnectionKnown', ...known }),
            ),
          );
        }),
    },
    // 1. Catalog
    ...catalog.workers,
  },
  children: {
    // 0. Connection: anew once its Connection runs here again.
    project: Actor.child(ProjectRow, {
      key: ({ model }) => readingOf(model.runs),
      props: ({ props }) => ({
        connectionId: props.params.connectionId,
        projectId: props.params.projectId,
      }),
    }),
    // 2. Draft, while no session is open over it, or the one it started
    // is not yet drawn whole.
    draft: Actor.child(Draft.actor, {
      while: ({ model, props }) => drafting(props.route.page, model.handover),
      props: ({ props }) => ({
        accountId: accountIn(props.route.params),
        connectionId: props.params.connectionId,
        projectId: props.params.projectId,
        to: { _tag: 'NewSession' as const },
      }),
    }),
  },
  on: {
    ConnectionKnown: (known, { model }) => ({
      model: { ...model, ...known, runs: runsAfter(model, known.here) },
    }),
    // 4. Ready, at each place in it; a Session handed over is drawn whole.
    Ready: ({ at }, { model }) =>
      model.ready === at && model.handover !== at
        ? {}
        : { model: { ...model, ...readyAt(model, at) } },
    // 2. Draft
    HandedOver: ({ sessionId }, { model }) => ({
      model: { ...model, handover: sessionId },
    }),
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
              connectionId: props.params.connectionId,
              id: props.params.projectId,
            }),
          },
    Removed: (_, { model, props }) => ({
      model: {
        ...model,
        removal: { confirming: false, removing: false, problem: null },
      },
      command: Router.push(home(accountIn(props.route.params))),
    }),
    RemoveRefused: ({ reason }, { model }) => ({
      model: {
        ...model,
        removal: { ...model.removal, removing: false, problem: reason },
      },
    }),
  },
});
