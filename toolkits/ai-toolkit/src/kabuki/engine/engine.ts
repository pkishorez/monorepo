import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { Clock, Context, Data, Duration, Effect, Layer, Stream } from 'effect';
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
  type HarnessError,
  type HarnessSession,
  type McpServerStatus,
  type Skill,
} from '../../services/harness/contract/index.js';
import type { HarnessName, Json } from '../../services/records/raw/index.js';
import type {
  Project,
  Session,
} from '../../services/records/entities/index.js';
import { Store } from '../../services/records/store/index.js';
import { fallbackTitle } from './actor-projects/actor-project/actor-session/index.js';
import { Projects } from './actor-projects/index.js';
import {
  AskFailed,
  Desks,
  NotForkable,
  type Desk,
} from './capabilities/index.js';
import { promptOf } from './prompt/index.js';
import {
  binaryRow,
  desks,
  FolderExists,
  FolderNotFound,
  Folders,
  FolderUnreadable,
  InvalidBinary,
  InvalidFolderName,
  OutsideHome,
  PermissionDenied,
  setBinary,
  storedHarnessBinaries,
  type HarnessBinaryRow,
} from './services/index.js';

/*
 * The engine's front door, as code outside its tree reaches it. Three rules:
 *
 * 1. Everything the user does is a Message to one actor. Each call mints the
 *    ids its reply needs, finds the Instance it is for, and Sends. Nothing
 *    here runs a turn or decides anything.
 * 2. Everything the user reads is the tree's state, read through the root
 *    Instance.
 * 3. A question for a Session's agent is asked at the Session's Desk (see
 *    capabilities/desks.ts): a Fork, a new Title, an Ask, what the agent
 *    says of itself. A question for a harness alone, its Skills or its
 *    Harness Binary, is asked of the harness; one about the folders under
 *    home, of Folders (see services/folders/).
 */

export class ProjectNotFound extends Data.TaggedError('ProjectNotFound')<{
  readonly id: string;
}> {}
export class SessionNotFound extends Data.TaggedError('SessionNotFound')<{
  readonly id: string;
}> {}
export class UnknownHarness extends Data.TaggedError('UnknownHarness')<{
  readonly harness: string;
}> {}
export class SkillsUnavailable extends Data.TaggedError('SkillsUnavailable')<{
  readonly message: string;
}> {}
export class HarnessFailed extends Data.TaggedError('HarnessFailed')<{
  readonly message: string;
}> {}
export {
  AskFailed,
  FolderExists,
  FolderNotFound,
  FolderUnreadable,
  InvalidBinary,
  InvalidFolderName,
  NotForkable,
  OutsideHome,
  PermissionDenied,
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
  /** The folder `listFolder` and `createFolder` never leave. */
  readonly home: string;
}

export interface EngineService {
  /** The sub-folders of a folder under home; with a query, only the names holding it. */
  readonly listFolder: Folders['Service']['list'];
  /** Makes one new folder under home, with `git init`, to add as a Project. */
  readonly createFolder: Folders['Service']['create'];
  /**
   * Adds a folder as a Project, its symlinks resolved so one folder is one
   * Project; the one already added for it, if any.
   */
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
  /** Settles a Session; one already Settled keeps when it was. */
  readonly settleSession: (
    sessionId: string,
  ) => Effect.Effect<void, SessionNotFound>;
  readonly unsettleSession: (
    sessionId: string,
  ) => Effect.Effect<void, SessionNotFound>;
  /**
   * A new idle Session with the context up to a finished Turn's end, its
   * own or one it inherited; null takes the latest.
   */
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

/** How long a Session's Desk may take to come out before it counts as gone. */
const DESK_WAIT = Duration.seconds(5);

const expand = (path: string) =>
  resolve(
    path === '~' || path.startsWith('~/') ? homedir() + path.slice(1) : path,
  );

/** The folder at `path` with its symlinks resolved; null when there is none. */
const folderAt = (path: string) =>
  Effect.promise(() =>
    realpath(path).then(
      (real) => stat(real).then((found) => (found.isDirectory() ? real : null)),
      () => null,
    ),
  );

const sameJobs = (
  a: ReadonlyArray<SessionJobs>,
  b: ReadonlyArray<SessionJobs>,
) => JSON.stringify(a) === JSON.stringify(b);

const failed = (error: HarnessError) =>
  new HarnessFailed({ message: error.message });

const make = (options: EngineOptions) =>
  Effect.gen(function* () {
    const harnesses = yield* Harnesses;
    const atDesks = yield* Desks;
    const folders = yield* Folders;
    const services = yield* Effect.context<
      Store | Harnesses | Titler | HarnessBinaries | Desks
    >();
    const running = yield* Runtime.start(
      Projects,
      Layer.succeedContext(services),
    );
    const root = running.instance({ from: 'rpc' });
    // The root reads the Store first; the engine is open once it is Ready.
    yield* running.changes.pipe(
      Stream.filter(() => root.state._tag === 'Ready'),
      Stream.runHead,
    );

    /** Gives a harness call the Harness Binaries the user set. */
    const withServices = Effect.provideContext(services);

    /** The Project Instances; there are none while Loading. */
    const projects = () => {
      const children = root.children;
      return 'projects' in children ? children.projects : [];
    };
    const projectAt = (id: string) =>
      projects().find((project) => project.key === id);
    const sessionAt = (id: string) =>
      projects()
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

    /** The Session's Desk; a Session that is there puts one out as it starts. */
    const deskOf = (sessionId: string) =>
      Effect.andThen(toSession(sessionId), atDesks.of(sessionId));

    /** The Desk, or HarnessFailed when it is not out in time. */
    const deskNow = (sessionId: string) =>
      deskOf(sessionId).pipe(
        Effect.timeoutOrElse({
          duration: DESK_WAIT,
          orElse: () =>
            Effect.fail(
              new HarnessFailed({
                message: "The session's agent is not running",
              }),
            ),
        }),
      );

    /** Asks a Session's agent, opening it if it is not open. */
    const fromAgent = <A>(
      sessionId: string,
      read: (agent: HarnessSession) => Effect.Effect<A, HarnessError>,
    ) =>
      Effect.gen(function* () {
        const desk: Desk = yield* deskNow(sessionId);
        const agent = yield* Effect.mapError(desk.agent, failed);
        return yield* Effect.mapError(read(agent), failed);
      });

    const send: EngineService['send'] = (sessionId, message) =>
      Effect.gen(function* () {
        const { session } = yield* toSession(sessionId);
        const prompt = yield* promptOf({
          ...message,
          root: options.attachments,
          sessionId,
          id: yield* nextUlid,
        });
        session.send({
          _tag: 'Send',
          prompt,
          at: yield* Clock.currentTimeMillis,
        });
      });

    const service: EngineService = {
      listFolder: folders.list,
      createFolder: folders.create,

      addProject: (given) =>
        Effect.gen(function* () {
          const path = yield* folderAt(expand(given));
          if (path === null) return yield* new FolderNotFound({ path: given });
          const known = projects().find(
            (project) => project.model.project.path === path,
          );
          if (known) return known.model.project;
          const project: Project = {
            id: yield* nextUlid,
            path,
            name: basename(path),
            createdAt: yield* Clock.currentTimeMillis,
          };
          root.send({ _tag: 'AddProject', project });
          return project;
        }),

      removeProject: (id) =>
        Effect.suspend(() =>
          projectAt(id)
            ? Effect.sync(() => void root.send({ _tag: 'RemoveProject', id }))
            : Effect.fail(new ProjectNotFound({ id })),
        ),

      startSession: (input) =>
        Effect.gen(function* () {
          const project = projectAt(input.projectId);
          if (!project)
            return yield* new ProjectNotFound({ id: input.projectId });
          if (!harnesses.all.some((harness) => harness.name === input.harness))
            return yield* new UnknownHarness({ harness: input.harness });
          const now = yield* Clock.currentTimeMillis;
          const session: Session = {
            id: yield* nextUlid,
            projectId: input.projectId,
            harness: input.harness,
            model: input.model,
            settings: { ...input.settings },
            title: fallbackTitle(input.text),
            status: 'running',
            nativeId: null,
            createdAt: now,
            forkedFrom: null,
            settledAt: null,
            activeAt: now,
            endedAt: null,
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

      settleSession: (sessionId) =>
        Effect.gen(function* () {
          const { session } = yield* toSession(sessionId);
          session.send({ _tag: 'Settle', at: yield* Clock.currentTimeMillis });
        }),

      unsettleSession: (sessionId) =>
        Effect.map(toSession(sessionId), ({ session }) =>
          session.send({ _tag: 'Unsettle' }),
        ),

      forkSession: (sessionId, afterTurnId) =>
        Effect.gen(function* () {
          const { project } = yield* toSession(sessionId);
          const desk = yield* deskOf(sessionId);
          const fork = yield* desk.fork(afterTurnId);
          project.send({ _tag: 'AddSession', session: fork });
          return fork;
        }),

      ask: (sessionId, question, schema) =>
        Effect.flatMap(deskOf(sessionId), (desk) => desk.ask(question, schema)),

      regenerateTitle: (sessionId) =>
        Effect.flatMap(deskOf(sessionId), (desk) => desk.retitle),

      skills: (projectId, name) =>
        Effect.gen(function* () {
          const project = projectAt(projectId);
          if (!project) return yield* new ProjectNotFound({ id: projectId });
          const harness = harnesses.all.find((each) => each.name === name);
          if (!harness)
            return yield* new SkillsUnavailable({
              message: `No harness named ${name}`,
            });
          return yield* harness.skills(project.model.project.path).pipe(
            withServices,
            Effect.mapError(
              (error) => new SkillsUnavailable({ message: error.message }),
            ),
          );
        }),

      mcpStatus: (sessionId) =>
        fromAgent(sessionId, (agent) => agent.mcpStatus),

      contextUsage: (sessionId) =>
        fromAgent(sessionId, (agent) => agent.contextUsage),

      backgroundJobs: running.changes.pipe(
        Stream.map(() =>
          projects().flatMap((project) =>
            project.children.sessions.flatMap((session): Array<SessionJobs> => {
              const { jobs } = session.model;
              return jobs.length === 0
                ? []
                : [{ sessionId: session.key!, projectId: project.key!, jobs }];
            }),
          ),
        ),
        Stream.changesWith(sameJobs),
      ),

      // An agent not open has no jobs to stop.
      stopBackgroundJob: (sessionId, jobId) =>
        Effect.gen(function* () {
          const desk = yield* deskNow(sessionId);
          const agent = yield* desk.opened;
          if (agent)
            yield* Effect.mapError(agent.stopBackgroundJob(jobId), failed);
        }),

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
  /** Runs the engine until its Scope closes; the root sweeps the Store first. */
  static readonly layer = (
    options: EngineOptions,
  ): Layer.Layer<Engine, never, Store | Harnesses | Titler> =>
    Layer.effect(Engine, make(options)).pipe(
      Layer.provide(
        Layer.mergeAll(
          storedHarnessBinaries,
          desks,
          Folders.layer({ home: options.home }),
        ),
      ),
    );
}
