import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import {
  Clock,
  Context,
  Data,
  Effect,
  Fiber,
  Layer,
  Option,
  Schema,
  Semaphore,
  Stream,
} from 'effect';
import { Runtime } from '@kestack/kabuki';
import { Stopped } from '@kestack/kabuki/core/runtime';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  HarnessAccount,
  Harnesses,
  InvalidBinary,
  OneShotPrompt,
  type HarnessError,
} from '@kestack/ai-toolkit/harness';
import {
  AgentQuestionSchema,
  type AskAnswer,
  type Attachment,
  type BackgroundJob,
  type ContextUsage,
  type Json,
  type McpServerStatus,
  type QuestionAnswer,
  type Skill,
} from '@kestack/ai-toolkit/contract';
import type {
  HarnessAccountRecord,
  Project,
  Session,
} from '../records/index.js';
import {
  AskFailed,
  fallbackTitle,
  NotForkable,
  type AgentClosed,
} from './actor-code/actor-session/index.js';
import { Code } from './actor-code/index.js';
import { saveAttachments } from './attachments/index.js';
import {
  Agents,
  Answers,
  Git,
  HarnessAccounts,
  Store,
} from './capabilities/index.js';
import {
  accountOf,
  accountRow,
  agents,
  allAccounts,
  answers,
  FolderExists,
  FolderNotFound,
  Folders,
  FolderUnreadable,
  git,
  InvalidAccount,
  InvalidFolderName,
  OutsideHome,
  PermissionDenied,
  removeAccount,
  saveAccount,
  storedHarnessAccounts,
  type AccountInput,
  type HarnessAccountRow,
} from './services/index.js';
import {
  GitFailed,
  place,
  step,
  unplace,
  type ReportStep,
  type StartStepName,
  type StartStepReport,
} from './starting.js';

/*
 * The engine's front door, as code outside its tree reaches it. Three rules:
 *
 * 1. Everything the user does is a Message to one actor. Each call mints the
 *    ids its reply needs, finds the Instance it is for, and Sends. Nothing
 *    here runs a turn or decides anything.
 * 2. Everything the user reads is the tree's state, read through the root
 *    Instance.
 * 3. Every question for a Session, a Fork, an Ask, a new Title, its
 *    Agent's MCP Server Status and Context Usage, is a Query on the
 *    Session Instance; what the answer changes is a Message after it, such
 *    as AddSession for a Fork. A question for a harness alone, its Skills
 *    or a Harness Account's binary, is asked of the harness as that account; one about the folders
 *    under home, of Folders (see services/folders/).
 */

export class ProjectNotFound extends Data.TaggedError('ProjectNotFound')<{
  readonly id: string;
}> {}
export class SessionNotFound extends Data.TaggedError('SessionNotFound')<{
  readonly id: string;
}> {}
export class UnknownAccount extends Data.TaggedError('UnknownAccount')<{
  readonly account: string;
}> {}
export class SkillsUnavailable extends Data.TaggedError('SkillsUnavailable')<{
  readonly message: string;
}> {}
export class HarnessFailed extends Data.TaggedError('HarnessFailed')<{
  readonly message: string;
}> {}
/** The Agent Question is no longer asked, as when another device answered it. */
export class QuestionNotAsked extends Data.TaggedError('QuestionNotAsked')<{
  readonly id: string;
}> {}
export { Store, type Feed } from './capabilities/index.js';
export { projectEngineRaw } from './engine-raw/index.js';
export { storedHarnessAccounts, storeLayer } from './services/index.js';
export {
  AskFailed,
  GitFailed,
  FolderExists,
  FolderNotFound,
  FolderUnreadable,
  InvalidAccount,
  InvalidBinary,
  InvalidFolderName,
  NotForkable,
  OutsideHome,
  PermissionDenied,
};
export type { ReportStep, StartStepName, StartStepReport };

/** A user message, as a client sends it. */
export interface Send {
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
  /** The Language Model from this Turn on. */
  readonly model?: string | undefined;
  /** Setting values from this Turn on. */
  readonly settings?: Readonly<Record<string, string>> | undefined;
}

/** A ULID as written: 26 of Crockford's base 32, upper case. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export interface StartSession {
  /**
   * Its id, chosen by the App so it knows the Session before the answer:
   * a ULID, as the Connection's own are, for it names a folder on disk. The
   * Connection chooses one when it is not given, is not a ULID, or is another
   * Project's Session's. Asked again with one of this Project's, it starts
   * nothing and answers with that Session as it is now.
   */
  readonly id?: string | undefined;
  readonly projectId: string;
  /** The Harness Account it runs as, and so its harness. */
  readonly account: string;
  readonly model: string;
  readonly settings: Readonly<Record<string, string>>;
  readonly text: string;
  readonly attachments: ReadonlyArray<Attachment>;
  /**
   * The branch it runs on, local or Origin (`origin/main`); null or left
   * out for wherever the Project's folder is.
   */
  readonly branch?: string | null | undefined;
  /** Whether it runs in a new Worktree, on a new branch from `branch`. */
  readonly newWorktree?: boolean | undefined;
}

/** A Project's git branches, or NotGit. */
export type Branches =
  | { readonly _tag: 'NotGit' }
  | {
      readonly _tag: 'Git';
      readonly current: string | null;
      readonly worktrees: ReadonlyArray<{
        readonly path: string;
        readonly branch: string | null;
      }>;
      readonly local: ReadonlyArray<{
        readonly name: string;
        readonly upstream: string | null;
        readonly worktree: string | null;
      }>;
      /** Every Origin branch no local branch tracks, so an App lists each once. */
      readonly origin: ReadonlyArray<string>;
    };

/** One Session's Background Jobs. */
export interface SessionJobs {
  readonly sessionId: string;
  readonly projectId: string;
  readonly jobs: ReadonlyArray<BackgroundJob>;
}

/** The Agent Questions one Session's running Turn waits on. */
const SessionQuestions = Schema.Struct({
  sessionId: Schema.String,
  projectId: Schema.String,
  questions: Schema.Array(AgentQuestionSchema),
});
export type SessionQuestions = typeof SessionQuestions.Type;

export interface EngineOptions {
  /** Where Attachments that are not images are saved, one folder per Session. */
  readonly attachments: string;
  /** The folder `listFolder` and `createFolder` never leave. */
  readonly home: string;
  /**
   * Where new Worktrees are made, one folder per Project: outside any one
   * Connection's, so forgetting a Connection never deletes one.
   */
  readonly worktrees: string;
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
  /** Removes a Project and its sessions, stopped; its folder is never touched. */
  readonly removeProject: (id: string) => Effect.Effect<void, ProjectNotFound>;
  /**
   * The Project's git branches; each call starts one fetch from Origin in
   * the background, unless one runs for it already.
   */
  readonly branches: (
    projectId: string,
  ) => Effect.Effect<Branches, ProjectNotFound>;
  /**
   * Starts a Session already running its first message, after the git
   * step it needs, reporting each step; started once its Agent has opened.
   * A git step that fails starts nothing, and an Agent that fails to open,
   * HarnessFailed, keeps no Session, nor the Worktree or branch made for
   * it; a folder switched for it stays switched. Once begun, it runs
   * to the end even if its caller goes away; Connect stopping ends it,
   * taken back the same way. A Session that cannot save its first message
   * or itself is HarnessFailed too.
   */
  readonly startSession: (
    input: StartSession,
    report?: ReportStep,
  ) => Effect.Effect<
    Session,
    ProjectNotFound | UnknownAccount | GitFailed | HarnessFailed
  >;
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
  /** The Skills a Harness Account's harness offers in a Project's folder. */
  readonly skills: (
    projectId: string,
    account: string,
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
  /** Asks the Session to stop one of its agent's Background Jobs, and waits until it is gone, or the harness refused. */
  readonly stopBackgroundJob: (
    sessionId: string,
    jobId: string,
  ) => Effect.Effect<void, SessionNotFound | HarnessFailed>;
  /** Every Session with Agent Questions, now, then again on each change. */
  readonly agentQuestions: Stream.Stream<ReadonlyArray<SessionQuestions>>;
  /**
   * Gives a Session's agent the answer to one of its Agent Questions, or
   * declines it with null, and waits until the agent took it or refused,
   * as it does one no longer asked.
   */
  readonly answerQuestion: (
    sessionId: string,
    questionId: string,
    answer: QuestionAnswer | null,
  ) => Effect.Effect<void, SessionNotFound | QuestionNotAsked | HarnessFailed>;
  /** The Harness Account with this id. */
  readonly harnessAccount: (
    id: string,
  ) => Effect.Effect<HarnessAccountRecord, UnknownAccount>;
  /** Every Harness Account, each harness's Default Account first. */
  readonly harnessAccounts: Effect.Effect<ReadonlyArray<HarnessAccountRow>>;
  /** Saves a Harness Account once its binary runs; a new one when its id is null. */
  readonly saveHarnessAccount: (
    input: AccountInput,
  ) => Effect.Effect<HarnessAccountRow, InvalidBinary | InvalidAccount>;
  /** Removes an account the user added; a Session on it fails its next Turn. */
  readonly removeHarnessAccount: (
    id: string,
  ) => Effect.Effect<void, InvalidAccount>;
  /** Runs a harness call as account `id`. */
  readonly runAs: (
    id: string,
  ) => <A, E>(
    effect: Effect.Effect<A, E, HarnessAccount>,
  ) => Effect.Effect<A, E | HarnessError>;
}

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

const sameQuestions = Schema.toEquivalence(Schema.Array(SessionQuestions));

/** What a Query of the agent fails with, as one HarnessFailed. */
const failed = (error: HarnessError | AgentClosed | Stopped) =>
  new HarnessFailed({
    message:
      error._tag === 'AgentClosed'
        ? "The session's agent is not running"
        : error._tag === 'Stopped'
          ? 'The session has stopped'
          : error.message,
  });

const make = (options: EngineOptions) =>
  Effect.gen(function* () {
    const harnesses = yield* Harnesses;
    const folders = yield* Folders;
    const services = yield* Effect.context<
      | Store
      | Harnesses
      | OneShotPrompt
      | HarnessAccounts
      | Agents
      | Answers
      | Git
    >();
    const repos = yield* Git;
    const accounts = yield* HarnessAccounts;
    const replies = yield* Answers;
    const running = yield* Runtime.start(Code, Layer.succeedContext(services));
    /** Closed as Connect stops, before the Sessions, interrupting a start. */
    const scope = yield* Effect.scope;
    const root = running.instance({ from: 'rpc' });
    // The root reads the Store first; the engine is open once it is Ready.
    yield* running.changes.pipe(
      Stream.filter(() => root.state._tag === 'Ready'),
      Stream.runHead,
    );

    /** Gives a call the Store. */
    const withServices = Effect.provideContext(services);
    /**
     * New Sessions asked for under one id admitted one at a time, from
     * reading whether the id is free to the Session's start, so two asked
     * at once under it never both start it; others, under other ids or
     * none, never wait for them. A lock lives while anyone holds or waits
     * for it.
     */
    const locks = new Map<
      string,
      { lock: Semaphore.Semaphore; users: number }
    >();
    const admitting =
      (id: string | null) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        id === null
          ? effect
          : Effect.acquireUseRelease(
              Effect.sync(() => {
                const entry = locks.get(id) ?? {
                  lock: Semaphore.makeUnsafe(1),
                  users: 0,
                };
                entry.users += 1;
                locks.set(id, entry);
                return entry;
              }),
              (entry) => entry.lock.withPermits(1)(effect),
              (entry) =>
                Effect.sync(() => {
                  entry.users -= 1;
                  if (entry.users === 0) locks.delete(id);
                }),
            );

    const runAs: EngineService['runAs'] = (id) => (effect) =>
      Effect.flatMap(accounts.as(id), (account) =>
        Effect.provideService(effect, HarnessAccount, account),
      );

    const harnessAccount: EngineService['harnessAccount'] = (id) =>
      accountOf(harnesses.all, id).pipe(
        withServices,
        Effect.flatMap((found) =>
          found === undefined
            ? Effect.fail(new UnknownAccount({ account: id }))
            : Effect.succeed(found),
        ),
      );

    /** The Projects; there are none while Loading. */
    const projects = () => root.model.projects;
    const projectAt = (id: string) =>
      projects().find((project) => project.id === id);
    /** The Session Instances; there are none while Loading. */
    const sessions = () => {
      const children = root.children;
      return 'sessions' in children ? children.sessions : [];
    };

    const toSession = (id: string) =>
      Effect.suspend(() => {
        const found = sessions().find((session) => session.key === id);
        return found
          ? Effect.succeed(found)
          : Effect.fail(new SessionNotFound({ id }));
      });

    /** A user message as a Session keeps it, its files saved on disk. */
    const promptOf = (sessionId: string, message: Send) =>
      Effect.gen(function* () {
        const id = yield* nextUlid;
        const attachments = yield* saveAttachments(
          options.attachments,
          sessionId,
          message.attachments,
        );
        return {
          id,
          text: message.text,
          attachments,
          ...(message.model === undefined ? {} : { model: message.model }),
          ...(message.settings === undefined
            ? {}
            : { settings: { ...message.settings } }),
        };
      });

    const send: EngineService['send'] = (sessionId, message) =>
      Effect.gen(function* () {
        const session = yield* toSession(sessionId);
        const prompt = yield* promptOf(sessionId, message);
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
          const known = projects().find((project) => project.path === path);
          // Its folder is back: the Folder Check finds it at once.
          if (known?.folder === 'missing') root.send({ _tag: 'FoldersAsked' });
          if (known) return known;
          const project: Project = {
            id: yield* nextUlid,
            path,
            name: basename(path),
            createdAt: yield* Clock.currentTimeMillis,
            folder: 'present',
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

      branches: (projectId) =>
        Effect.gen(function* () {
          const project = projectAt(projectId);
          if (!project) return yield* new ProjectNotFound({ id: projectId });
          const found = yield* repos.branches(project.path);
          if (found === null) return { _tag: 'NotGit' } as const;
          yield* repos.fetch(project.path);
          const tracked = new Set(found.local.map((each) => each.upstream));
          return {
            _tag: 'Git',
            ...found,
            origin: found.origin.filter((name) => !tracked.has(name)),
          } as const;
        }),

      startSession: (input, report = () => Effect.void) => {
        const chosen =
          input.id !== undefined && ULID.test(input.id) ? input.id : null;
        // Run apart from its caller, so it runs to the end even if the
        // caller goes away, and with git steps no stop leaves half done;
        // only waiting for its Session to start can be stopped, by Connect
        // stopping, which takes it back.
        return Effect.uninterruptibleMask((restore) =>
          admitting(chosen)(
            Effect.gen(function* () {
              const project = projectAt(input.projectId);
              if (!project)
                return yield* new ProjectNotFound({ id: input.projectId });
              const there =
                chosen === null
                  ? undefined
                  : root.model.sessions.find(
                      ({ session }) => session.id === chosen,
                    );
              // Asked again, as after an answer that was lost: the one there,
              // as it is now.
              if (there !== undefined && there.session.projectId === project.id)
                return (
                  (yield* Effect.flatMap(Store, (store) =>
                    store.session(there.session.id),
                  ).pipe(withServices)) ?? there.session
                );
              const account = yield* harnessAccount(input.account);
              const id =
                chosen !== null && there === undefined
                  ? chosen
                  : yield* nextUlid;
              const placed = yield* place(
                {
                  project,
                  id,
                  branch: input.branch ?? null,
                  newWorktree: input.newWorktree ?? false,
                  worktrees: options.worktrees,
                },
                report,
              ).pipe(withServices);
              return yield* step(
                report,
                'startingAgent',
                Effect.gen(function* () {
                  const now = yield* Clock.currentTimeMillis;
                  const session: Session = {
                    id,
                    projectId: input.projectId,
                    harness: account.harness,
                    account: account.id,
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
                    worktree: placed.worktree,
                    branch: placed.branch,
                  };
                  const first = yield* promptOf(session.id, {
                    text: input.text,
                    attachments: input.attachments,
                  });
                  root.send({ _tag: 'StartSession', session, first });
                  // Its Project went as it started: nothing started.
                  if (
                    !root.model.sessions.some((each) => each.session.id === id)
                  )
                    return yield* new ProjectNotFound({ id: project.id });
                  // Started once its Agent has opened, its first message is
                  // written and it is saved; else it was never saved, and goes.
                  // Known gap: Connect stopping between the two leaves the
                  // first message's records with no Session.
                  yield* restore(
                    Effect.flatMap(Agents, (agents) =>
                      Effect.flatMap(
                        agents.of(id),
                        (kept) => kept.firstSave.await,
                      ),
                    ),
                  ).pipe(
                    withServices,
                    Effect.onError(() =>
                      Effect.sync(
                        () => void root.send({ _tag: 'DropSession', id }),
                      ),
                    ),
                    Effect.mapError(
                      (error) => new HarnessFailed({ message: error.message }),
                    ),
                  );
                  return session;
                }).pipe(
                  Effect.onError(() =>
                    unplace(project, placed).pipe(withServices),
                  ),
                ),
              );
            }),
          ),
        ).pipe(Effect.forkIn(scope), Effect.flatMap(Fiber.join));
      },

      send,

      cancel: (sessionId) =>
        Effect.map(toSession(sessionId), (session) =>
          session.send({ _tag: 'Cancel' }),
        ),

      settleSession: (sessionId) =>
        Effect.gen(function* () {
          const session = yield* toSession(sessionId);
          session.send({ _tag: 'Settle', at: yield* Clock.currentTimeMillis });
        }),

      unsettleSession: (sessionId) =>
        Effect.map(toSession(sessionId), (session) =>
          session.send({ _tag: 'Unsettle' }),
        ),

      forkSession: (sessionId, afterTurnId) =>
        Effect.gen(function* () {
          const session = yield* toSession(sessionId);
          const fork = yield* session.queries.fork(afterTurnId).pipe(
            // A Session that stopped while asked is no longer there.
            Effect.catchTag('Stopped', () =>
              Effect.fail(new SessionNotFound({ id: sessionId })),
            ),
          );
          root.send({ _tag: 'AddSession', session: fork });
          return fork;
        }),

      ask: (sessionId, question, schema) =>
        Effect.flatMap(toSession(sessionId), (session) =>
          session.queries.ask({ question, schema }).pipe(
            // A Session that stopped while asked is no longer there.
            Effect.catchTag('Stopped', () =>
              Effect.fail(new SessionNotFound({ id: sessionId })),
            ),
          ),
        ),

      regenerateTitle: (sessionId) =>
        Effect.gen(function* () {
          const session = yield* toSession(sessionId);
          const found = yield* session.queries.retitle().pipe(
            // A Session that stopped while asked is no longer there.
            Effect.catchTag('Stopped', () =>
              Effect.fail(new SessionNotFound({ id: sessionId })),
            ),
          );
          if (found === null) return session.model.session.title;
          session.send({ _tag: 'Titled', title: found });
          return found;
        }),

      skills: (projectId, id) =>
        Effect.gen(function* () {
          const project = projectAt(projectId);
          if (!project) return yield* new ProjectNotFound({ id: projectId });
          const account = yield* harnessAccount(id).pipe(
            Effect.mapError(
              () =>
                new SkillsUnavailable({ message: `No Harness Account ${id}` }),
            ),
          );
          return yield* harnesses
            .get(account.harness)
            .skills(project.path)
            .pipe(
              runAs(id),
              // As in a folder gone: the Folder Check looks at once.
              Effect.tapError(() =>
                Effect.sync(() => root.send({ _tag: 'FoldersAsked' })),
              ),
              Effect.mapError(
                (error) => new SkillsUnavailable({ message: error.message }),
              ),
            );
        }),

      mcpStatus: (sessionId) =>
        Effect.flatMap(toSession(sessionId), (session) =>
          Effect.mapError(session.queries.mcpStatus(), failed),
        ),

      contextUsage: (sessionId) =>
        Effect.flatMap(toSession(sessionId), (session) =>
          Effect.mapError(session.queries.contextUsage(), failed),
        ),

      backgroundJobs: running.changes.pipe(
        Stream.map(() =>
          sessions().flatMap((session): Array<SessionJobs> => {
            const { jobs } = session.model;
            return jobs.length === 0
              ? []
              : [
                  {
                    sessionId: session.key!,
                    projectId: session.model.session.projectId,
                    jobs,
                  },
                ];
          }),
        ),
        Stream.changesWith(sameJobs),
      ),

      stopBackgroundJob: (sessionId, jobId) =>
        Effect.gen(function* () {
          const session = yield* toSession(sessionId);
          session.send({ _tag: 'StopJob', jobId });
          // Gone from the agent's jobs, or refused: the Session's Model says which first.
          const outcome = yield* running.changes.pipe(
            Stream.map(() => {
              const refused = session.model.refusedStops.find(
                (each) => each.jobId === jobId,
              );
              if (refused) return refused.reason;
              return session.model.jobs.some((job) => job.id === jobId)
                ? undefined
                : null;
            }),
            Stream.filter((found) => found !== undefined),
            Stream.runHead,
          );
          const reason = Option.getOrElse(outcome, () => null);
          if (reason !== null)
            return yield* new HarnessFailed({ message: reason });
        }),

      agentQuestions: running.changes.pipe(
        Stream.map(() =>
          sessions().flatMap((session): Array<SessionQuestions> => {
            const { questions } = session.model;
            return questions.length === 0
              ? []
              : [
                  {
                    sessionId: session.key!,
                    projectId: session.model.session.projectId,
                    questions,
                  },
                ];
          }),
        ),
        Stream.changesWith(sameQuestions),
      ),

      answerQuestion: (sessionId, questionId, answer) =>
        Effect.gen(function* () {
          const session = yield* toSession(sessionId);
          const answerId = yield* nextUlid;
          const outcome = yield* replies.await(
            answerId,
            Effect.suspend(() =>
              session.send({ _tag: 'Answer', answerId, questionId, answer })
                ? Effect.void
                : // It stopped just now, so it is no longer there.
                  Effect.fail(new SessionNotFound({ id: sessionId })),
            ),
          );
          if (outcome._tag === 'NotAsked')
            return yield* new QuestionNotAsked({ id: questionId });
          if (outcome._tag === 'Refused')
            return yield* new HarnessFailed({ message: outcome.reason });
        }),

      harnessAccount,

      harnessAccounts: allAccounts(harnesses.all).pipe(
        Effect.flatMap((all) =>
          Effect.forEach(
            all,
            (account) => accountRow(harnesses.get(account.harness), account),
            { concurrency: 'unbounded' },
          ),
        ),
        withServices,
      ),

      saveHarnessAccount: (input) =>
        saveAccount(harnesses.all, input).pipe(withServices),

      removeHarnessAccount: (id) =>
        removeAccount(harnesses.all, id).pipe(withServices),

      runAs,
    };
    return service;
  });

export class Engine extends Context.Service<Engine, EngineService>()(
  '@kestack/connect/Engine',
) {
  /** Runs the engine until its Scope closes; the root sweeps the Store first. */
  static readonly layer = (
    options: EngineOptions,
  ): Layer.Layer<Engine, never, Store | Harnesses | OneShotPrompt> =>
    Layer.effect(Engine, make(options)).pipe(
      Layer.provide(
        Layer.mergeAll(
          storedHarnessAccounts,
          agents,
          answers,
          git,
          Folders.layer({ home: options.home }).pipe(Layer.provide(git)),
        ),
      ),
    );
}
