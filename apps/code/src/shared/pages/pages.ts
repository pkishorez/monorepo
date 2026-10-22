import { Schema, Stream } from 'effect';
import { AiLive, connection } from '@kestack/ai-toolkit/client';
import { Navigation, Page, Router } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { Replicas } from '@kestack/std-toolkit/replica';
import { AddProjectLive } from './add-project/index.ts';
import { Projects, Sessions } from './ai/index.ts';
import { BackgroundJobsLive } from './background-jobs/index.ts';
import { Home, HomeLive } from './home/index.ts';
import {
  NewSessionLive,
  Project,
  ProjectLive,
  SessionLive,
} from './project/index.ts';
import { session } from './places/index.ts';
import { SessionActionsLive } from './session-actions/index.ts';
import { Settings, SettingsLive } from './settings/index.ts';

/*
 * The root page, drawn only in the browser: it runs the Replica of the
 * server's records for the whole app, reads every project and session for
 * the sidebar, holds the sidebar's add-a-folder form, follows every
 * session's Background Jobs, does what the header's session menu asks, and
 * follows the connection to the server, so the app can say when it is
 * down, and whether it has reached it yet: until then, an empty list means
 * nothing. It also opens a session the keyboard steps to.
 */

const ConnectionStatus = Schema.Literals([
  'connecting',
  'connected',
  'reconnecting',
]);

const App = Page.define({
  render: 'client',
  requires: [RpcConnection, Navigation],
  metadata: { title: 'code' },
  pages: { Home, Project, Settings },
  model: Schema.Struct({
    connection: ConnectionStatus,
    /** Connected at least once: until then, nothing synced says what is missing. */
    reached: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Connection: { status: ConnectionStatus },
    OpenSession: { projectId: Schema.String, sessionId: Schema.String },
  }),
});

const ReplicasLive = Replicas.child([AiLive]);

const AppLive = Page.build(App, {
  init: () => ({ model: { connection: 'connecting', reached: false } }),
  pages: { Home: HomeLive, Project: ProjectLive, Settings: SettingsLive },
  provides: () => Replicas.layer,
  children: {
    replicas: ReplicasLive,
    projects: { actor: Projects, props: () => ({}) },
    sessions: { actor: Sessions, props: () => ({}) },
    addProject: { actor: AddProjectLive },
    backgroundJobs: { actor: BackgroundJobsLive },
    sessionActions: { actor: SessionActionsLive },
  },
  workers: {
    connection: {
      run: (self) =>
        Stream.runForEach(connection, (status) =>
          self.send({ _tag: 'Connection', status }),
        ),
    },
  },
  on: {
    Connection: ({ status }, { model }) => ({
      model: {
        connection: status,
        reached: model.reached || status === 'connected',
      },
    }),
    OpenSession: ({ projectId, sessionId }) => ({
      command: Router.push(session(projectId, sessionId)),
    }),
  },
});

export const router = Router.define(App, {
  notFound: { title: 'Not found · code', robots: 'noindex' },
});

/** Every page's build, and the actors their Views draw. */
export const Pages = {
  AppLive,
  HomeLive,
  ProjectLive,
  SessionLive,
  NewSessionLive,
  AddProjectLive,
  SettingsLive,
  BackgroundJobsLive,
  SessionActionsLive,
};

export type Route = typeof router.route.Type;
