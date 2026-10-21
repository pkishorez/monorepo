import { Schema, Stream } from 'effect';
import { AiLive, connection } from '@kestack/ai-toolkit/client';
import { Page, Router } from '@kestack/kabuki/routing';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { Replicas } from '@kestack/std-toolkit/replica';
import { AddProjectLive } from './add-project/index.ts';
import { Projects, Sessions } from './ai/index.ts';
import { Home, HomeLive } from './home/index.ts';
import {
  NewSessionLive,
  Project,
  ProjectLive,
  SessionLive,
} from './project/index.ts';

/*
 * The root page, drawn only in the browser: it runs the Replica of the
 * server's records for the whole app, reads every project and session for
 * the sidebar, holds the sidebar's add-a-folder form, and follows the
 * connection to the server, so the app can say when it is down, and
 * whether it has reached it yet: until then, an empty list means nothing.
 */

const ConnectionStatus = Schema.Literals([
  'connecting',
  'connected',
  'reconnecting',
]);

const App = Page.define({
  render: 'client',
  requires: [RpcConnection],
  metadata: { title: 'AI' },
  pages: { Home, Project },
  model: Schema.Struct({
    connection: ConnectionStatus,
    /** Connected at least once: until then, nothing synced says what is missing. */
    reached: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Connection: { status: ConnectionStatus },
  }),
});

const ReplicasLive = Replicas.child([AiLive]);

const AppLive = Page.build(App, {
  init: () => ({ model: { connection: 'connecting', reached: false } }),
  pages: { Home: HomeLive, Project: ProjectLive },
  provides: () => Replicas.layer,
  children: {
    replicas: ReplicasLive,
    projects: { actor: Projects, props: () => ({}) },
    sessions: { actor: Sessions, props: () => ({}) },
    addProject: { actor: AddProjectLive },
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
  },
});

export const router = Router.define(App, {
  notFound: { title: 'Not found · AI', robots: 'noindex' },
});

/** Every page's build, and the actors their Views draw. */
export const Pages = {
  AppLive,
  HomeLive,
  ProjectLive,
  SessionLive,
  NewSessionLive,
  AddProjectLive,
};

export type Route = typeof router.route.Type;
