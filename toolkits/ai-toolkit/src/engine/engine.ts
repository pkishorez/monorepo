import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { Clock, Context, Data, Effect, Layer, Stream } from 'effect';
import { Runtime } from '@kestack/kabuki';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  HarnessBinaries,
  Harnesses,
  Titler,
  type AskAnswer,
  type Attachment,
  type BackgroundJob,
  type ContextUsage,
  type McpServerStatus,
  type Skill,
} from '../harness/index.js';
import type { HarnessName, Json } from '../raw/index.js';
import type { Project, Session } from '../records/index.js';
import { Store } from '../store/index.js';
import { promptOf } from './attachments/index.js';
import { bootstrap } from './bootstrap.js';
import { copyTranscript, forkPoint, NotForkable } from './fork/index.js';
import {
  binaryRow,
  InvalidBinary,
  setBinary,
  storedHarnessBinaries,
  type HarnessBinaryRow,
} from './harness-config/index.js';
import { Host } from './host.js';
import {
  ask,
  AskFailed,
  fromAgent,
  HarnessFailed,
  recentUserMessages,
  skills,
  SkillsUnavailable,
  stopJob,
} from './inquiry/index.js';
import { LiveAgents } from './live-agents/index.js';
import { fallbackTitle } from './project/session/index.js';

/*
 * The engine, as code outside its tree reaches it. Projects, Sessions and
 * Turns are actors under one Host, run headless here. Each call mints the
 * ids its reply needs, finds the Instance it is for, and Sends it a
 * Message: the actors do the rest. Nothing here runs a turn.
 *
 * A call that needs an answer goes around the actors, since a Message
 * answers nothing: a Fork is made here and joins its Project as a Message;
 * an Ask, the Skills, and what a Session's agent says of itself are asked
 * of the harness or the agent directly (see inquiry/); Harness Binaries are
 * read and set in the Store (see harness-config/).
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
export {
  AskFailed,
  HarnessFailed,
  InvalidBinary,
  NotForkable,
  SkillsUnavailable,
};

/** A user message, as a client sends it. */
export interface Send {
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
  /** The Language Model from this Turn on. */
  readonly model?: string | undefined;
  /** Setting values from this Turn on. */
  readonly settings?: Readonly<Record<string, string>> | undefined;
}

export interface StartSession {
  readonly projectId: string;
  readonly harness: HarnessName;
  readonly model: string;
  readonly settings: Readonly<Record<string, string>>;
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
}

/** One Session's Background Jobs. */
export interface SessionJobs {
  readonly sessionId: string;
  readonly projectId: string;
  readonly jobs: ReadonlyArray<BackgroundJob>;
}

export interface EngineOptions {
  /** Where Attachments that are not images are saved, one folder per Session. */
  readonly attachments: string;
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
    message: Send,
  ) => Effect.Effect<void, SessionNotFound>;
  readonly cancel: (sessionId: string) => Effect.Effect<void, SessionNotFound>;
  /** A new idle Session with the context up to a finished Turn's end; null takes the latest. */
  readonly forkSession: (
    sessionId: string,
    afterTurnId: string | null,
  ) => Effect.Effect<Session, SessionNotFound | NotForkable>;
  /** Answers a question from a Session's context, leaving it untouched. */
  readonly ask: (
    sessionId: string,
    question: string,
    schema: Json | null,
  ) => Effect.Effect<AskAnswer, SessionNotFound | AskFailed>;
  /** Writes the Session's Title afresh from the user's latest messages. */
  readonly regenerateTitle: (
    sessionId: string,
  ) => Effect.Effect<string, SessionNotFound>;
  readonly skills: (
    projectId: string,
    harness: HarnessName,
  ) => Effect.Effect<ReadonlyArray<Skill>, ProjectNotFound | SkillsUnavailable>;
  readonly mcpStatus: (
    sessionId: string,
  ) => Effect.Effect<
    ReadonlyArray<McpServerStatus>,
    SessionNotFound | HarnessFailed
  >;
  readonly contextUsage: (
    sessionId: string,
  ) => Effect.Effect<ContextUsage, SessionNotFound | HarnessFailed>;
  /** Every Session with Background Jobs, now, then again on each change. */
  readonly backgroundJobs: Stream.Stream<ReadonlyArray<SessionJobs>>;
  readonly stopBackgroundJob: (
    sessionId: string,
    jobId: string,
  ) => Effect.Effect<void, SessionNotFound | HarnessFailed>;
  /** Every harness's Harness Binary. */
  readonly harnessBinaries: Effect.Effect<ReadonlyArray<HarnessBinaryRow>>;
  readonly setHarnessBinary: (
    harness: HarnessName,
    path: string | null,
  ) => Effect.Effect<HarnessBinaryRow, InvalidBinary>;
}

/** How long the Titler may take when asked for a new Title. */
const TITLE_TIMEOUT = '60 seconds';

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

const sameJobs = (
  a: ReadonlyArray<SessionJobs>,
  b: ReadonlyArray<SessionJobs>,
) => JSON.stringify(a) === JSON.stringify(b);

const make = (options: EngineOptions) =>
  Effect.gen(function* () {
    const harnesses = yield* Harnesses;
    const titler = yield* Titler;
    const agents = yield* LiveAgents;
    const projects = yield* bootstrap;
    const services = yield* Effect.context<
      Store | Harnesses | Titler | HarnessBinaries | LiveAgents
    >();
    const running = yield* Runtime.start(Host, Layer.succeedContext(services));
    const host = running.instance({ from: 'rpc' });
    host.send({ _tag: 'Loaded', projects });

    /** Gives a call the Store, and harness calls the Harness Binaries the user set. */
    const withServices = Effect.provideContext(services);

    const projectAt = (id: string) =>
      host.children.projects.find((project) => project.key === id);
    const sessionAt = (id: string) =>
      host.children.projects
        .flatMap((project) =>
          project.children.sessions.map((session) => ({ project, session })),
        )
        .find(({ session }) => session.key === id);

    const toSession = (id: string) =>
      Effect.suspend(() => {
        const found = sessionAt(id);
        return found
          ? Effect.succeed(found)
          : Effect.fail(new SessionNotFound({ id }));
      });

    const agentOf = (sessionId: string) =>
      Effect.andThen(toSession(sessionId), agents.of(sessionId));

    const send: EngineService['send'] = (sessionId, message) =>
      Effect.gen(function* () {
        const { session } = yield* toSession(sessionId);
        const prompt = yield* promptOf({
          ...message,
          root: options.attachments,
          sessionId,
          id: yield* nextUlid,
        });
        session.send({ _tag: 'Send', prompt });
      });

    const forkSession: EngineService['forkSession'] = (
      sessionId,
      afterTurnId,
    ) =>
      Effect.gen(function* () {
        const { project, session } = yield* toSession(sessionId);
        const parent = session.model.session;
        if (parent.nativeId === null)
          return yield* new NotForkable({
            reason: 'This session has no agent context to fork yet',
          });
        const point = yield* forkPoint({
          sessionId,
          turnId: afterTurnId,
          running: session._tag === 'Running' ? session.state.turnId : null,
        });
        const forked = yield* harnesses
          .get(parent.harness)
          .fork({
            cwd: session.model.cwd,
            nativeId: parent.nativeId,
            at: point.nativeTurnId,
          })
          .pipe(
            withServices,
            Effect.mapError(
              (error) =>
                new NotForkable({
                  reason: `The agent could not fork: ${error.message}`,
                }),
            ),
          );
        const fork: Session = {
          ...parent,
          id: yield* nextUlid,
          settings: { ...parent.settings },
          title: `${parent.title} (fork)`,
          status: 'idle',
          nativeId: forked.nativeId,
          createdAt: yield* Clock.currentTimeMillis,
          forkedFrom: { sessionId, turnId: point.turnId },
        };
        yield* copyTranscript(point.transcript, fork.id);
        project.send({ _tag: 'AddSession', session: fork });
        return fork;
      }).pipe(withServices);

    const regenerateTitle: EngineService['regenerateTitle'] = (sessionId) =>
      Effect.gen(function* () {
        const { session } = yield* toSession(sessionId);
        const messages = yield* recentUserMessages(sessionId);
        const current = session.model.session.title;
        if (messages.length === 0) return current;
        // Run with the Store's Harness Binaries, like every harness call.
        const title = yield* titler.title(messages).pipe(
          withServices,
          Effect.timeout(TITLE_TIMEOUT),
          Effect.map((title) => title.trim()),
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning('Titler failed; keeping the title', error),
              '',
            ),
          ),
        );
        if (title === '') return current;
        session.send({ _tag: 'Titled', title });
        return title;
      }).pipe(withServices);

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
            forkedFrom: null,
          };
          const first = yield* promptOf({
            root: options.attachments,
            sessionId: session.id,
            id: yield* nextUlid,
            text: input.text,
            attachments: input.attachments,
          });
          project.send({ _tag: 'StartSession', session, first });
          return session;
        }),

      send,

      cancel: (sessionId) =>
        Effect.map(toSession(sessionId), ({ session }) =>
          session.send({ _tag: 'Cancel' }),
        ),

      forkSession,

      ask: (sessionId, question, schema) =>
        Effect.gen(function* () {
          const { session } = yield* toSession(sessionId);
          const { harness, nativeId, model } = session.model.session;
          return yield* ask(harnesses.get(harness), {
            cwd: session.model.cwd,
            nativeId,
            model,
            question,
            ...(schema === null ? {} : { schema }),
          }).pipe(withServices);
        }),

      regenerateTitle,

      skills: (projectId, name) =>
        Effect.gen(function* () {
          const project = projectAt(projectId);
          if (!project) return yield* new ProjectNotFound({ id: projectId });
          const harness = harnesses.all.find((each) => each.name === name);
          if (!harness)
            return yield* new SkillsUnavailable({
              message: `No harness named ${name}`,
            });
          return yield* skills(harness, project.model.project.path).pipe(
            withServices,
          );
        }),

      mcpStatus: (sessionId) =>
        fromAgent(agentOf(sessionId), (agent) => agent.mcpStatus),

      contextUsage: (sessionId) =>
        fromAgent(agentOf(sessionId), (agent) => agent.contextUsage),

      backgroundJobs: running.changes.pipe(
        Stream.map(() =>
          host.children.projects.flatMap((project) =>
            project.children.sessions.flatMap((session): Array<SessionJobs> => {
              const { jobs } = session.children.backgroundJobs.model;
              return jobs.length === 0
                ? []
                : [{ sessionId: session.key!, projectId: project.key!, jobs }];
            }),
          ),
        ),
        Stream.changesWith(sameJobs),
      ),

      stopBackgroundJob: (sessionId, jobId) =>
        stopJob(agentOf(sessionId), jobId),

      harnessBinaries: Effect.forEach(harnesses.all, binaryRow, {
        concurrency: 'unbounded',
      }).pipe(withServices),

      setHarnessBinary: (name, path) =>
        setBinary(harnesses.get(name), path).pipe(withServices),
    };
    return service;
  });

export class Engine extends Context.Service<Engine, EngineService>()(
  '@kestack/ai-toolkit/Engine',
) {
  /** Sweeps what the last run left running, then runs the engine until its Scope closes. */
  static readonly layer = (
    options: EngineOptions,
  ): Layer.Layer<Engine, never, Store | Harnesses | Titler> =>
    Layer.effect(Engine, make(options)).pipe(
      Layer.provide(Layer.merge(storedHarnessBinaries, LiveAgents.layer)),
    );
}
