import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { Clock, Context, Data, Effect, Layer } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { nextUlid } from '@kestack/std-toolkit/core';
import { Harnesses, Titler } from '../harness/index.js';
import type { HarnessName } from '../raw/index.js';
import type { Project, Session } from '../records/index.js';
import { Store } from '../store/index.js';
import { bootstrap } from './bootstrap.js';
import { Host } from './host.js';
import { fallbackTitle } from './project/session/index.js';

/*
 * The engine, as code outside its tree reaches it. Projects, Sessions and
 * Turns are actors under one Host, run headless here. Each call mints the
 * ids its reply needs, finds the Instance it is for, and Sends it a
 * Message: the actors do the rest. Nothing here runs a turn or writes a
 * record.
 */

export class ProjectNotFound extends Data.TaggedError('ProjectNotFound')<{
  readonly id: string;
}> {}
export class SessionNotFound extends Data.TaggedError('SessionNotFound')<{
  readonly id: string;
}> {}
export class FolderNotFound extends Data.TaggedError('FolderNotFound')<{
  readonly path: string;
}> {}
export class UnknownHarness extends Data.TaggedError('UnknownHarness')<{
  readonly harness: string;
}> {}

export interface StartSession {
  readonly projectId: string;
  readonly harness: HarnessName;
  readonly model: string;
  readonly settings: Readonly<Record<string, string>>;
  readonly text: string;
}

export interface EngineService {
  /** Adds a folder as a Project; the one already added for it, if any. */
  readonly addProject: (path: string) => Effect.Effect<Project, FolderNotFound>;
  /** Removes a Project and stops its sessions; its folder is never touched. */
  readonly removeProject: (id: string) => Effect.Effect<void, ProjectNotFound>;
  /** Starts a Session already running its first message. */
  readonly startSession: (
    input: StartSession,
  ) => Effect.Effect<Session, ProjectNotFound | UnknownHarness>;
  /** Starts a turn, or steers the running one. */
  readonly send: (
    sessionId: string,
    text: string,
  ) => Effect.Effect<void, SessionNotFound>;
  readonly cancel: (sessionId: string) => Effect.Effect<void, SessionNotFound>;
}

const expand = (path: string) =>
  resolve(
    path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path,
  );

const isFolder = (path: string) =>
  Effect.promise(() =>
    stat(path).then(
      (found) => found.isDirectory(),
      () => false,
    ),
  );

const make = Effect.gen(function* () {
  const harnesses = yield* Harnesses;
  const projects = yield* bootstrap;
  const services = yield* Effect.context<Store | Harnesses | Titler>();
  const running = yield* Runtime.start(Host, Layer.succeedContext(services));
  const host = running.instance({ from: 'rpc' });
  host.send({ _tag: 'Loaded', projects });

  const projectAt = (id: string) =>
    host.children.projects.find((project) => project.key === id);
  const sessionAt = (id: string) =>
    host.children.projects
      .flatMap((project) => project.children.sessions)
      .find((session) => session.key === id);

  const toSession = (id: string) =>
    Effect.suspend(() => {
      const session = sessionAt(id);
      return session
        ? Effect.succeed(session)
        : Effect.fail(new SessionNotFound({ id }));
    });

  const service: EngineService = {
    addProject: (given) =>
      Effect.gen(function* () {
        const path = expand(given);
        if (!(yield* isFolder(path)))
          return yield* new FolderNotFound({ path: given });
        const known = host.children.projects.find(
          (project) => project.model.project.path === path,
        );
        if (known) return known.model.project;
        const project: Project = {
          id: yield* nextUlid,
          path,
          name: basename(path),
          createdAt: yield* Clock.currentTimeMillis,
        };
        host.send({ _tag: 'AddProject', project });
        return project;
      }),

    removeProject: (id) =>
      Effect.suspend(() =>
        projectAt(id)
          ? Effect.sync(() => void host.send({ _tag: 'RemoveProject', id }))
          : Effect.fail(new ProjectNotFound({ id })),
      ),

    startSession: (input) =>
      Effect.gen(function* () {
        const project = projectAt(input.projectId);
        if (!project)
          return yield* new ProjectNotFound({ id: input.projectId });
        if (!harnesses.all.some((harness) => harness.name === input.harness))
          return yield* new UnknownHarness({ harness: input.harness });
        const session: Session = {
          id: yield* nextUlid,
          projectId: input.projectId,
          harness: input.harness,
          model: input.model,
          settings: { ...input.settings },
          title: fallbackTitle(input.text),
          status: 'running',
          nativeId: null,
          createdAt: yield* Clock.currentTimeMillis,
        };
        const { status: _, ...record } = session;
        project.send({
          _tag: 'StartSession',
          session: record,
          text: input.text,
          turnId: yield* nextUlid,
        });
        return session;
      }),

    send: (sessionId, text) =>
      Effect.gen(function* () {
        const session = yield* toSession(sessionId);
        session.send({ _tag: 'Send', text, turnId: yield* nextUlid });
      }),

    cancel: (sessionId) =>
      Effect.map(toSession(sessionId), (session) =>
        session.send({ _tag: 'Cancel' }),
      ),
  };
  return service;
});

export class Engine extends Context.Service<Engine, EngineService>()(
  '@kestack/ai-toolkit/Engine',
) {
  /** Sweeps what the last run left running, then runs the engine until its Scope closes. */
  static readonly layer: Layer.Layer<
    Engine,
    never,
    Store | Harnesses | Titler
  > = Layer.effect(Engine, make);
}
