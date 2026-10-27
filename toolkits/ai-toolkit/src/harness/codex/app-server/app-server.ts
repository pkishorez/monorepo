import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Effect, type Scope } from 'effect';
import {
  failureReason,
  HarnessError,
  type HarnessAccount,
} from '../../contract/index.js';
import { answer, declined } from './answers.js';
import { launcher } from './launcher.js';
import { shutdown } from './shutdown.js';
import {
  DELTA_METHODS,
  type Notification,
  type RequestMethod,
  type Requests,
  type UserInputRequest,
  type UserInputResponse,
} from './protocol.js';

/** A live `codex app-server` process, spoken to over JSON-RPC on stdio. */
export interface AppServer {
  readonly request: <M extends RequestMethod>(
    method: M,
    params: Requests[M]['params'],
  ) => Effect.Effect<Requests[M]['result'], HarnessError>;
  /** Hears every notification, and the process exiting; returns the unlisten. */
  readonly listen: (listener: Listener) => () => void;
  /**
   * Offers each question the agent asks to `take`, which keeps it to answer
   * later or returns false to have it declined at once. A server started
   * without questions declines every one and never calls `take`. Returns
   * the untake.
   */
  readonly takeQuestions: (
    take: (request: QuestionRequest) => boolean,
  ) => () => void;
}

/** A question the agent asks, kept to be answered later. */
export interface QuestionRequest {
  /** The server's id for it, as `serverRequest/resolved` names it. */
  readonly id: number | string;
  readonly params: UserInputRequest;
  /** Answers it; nothing once the process has exited. */
  readonly respond: (response: UserInputResponse) => void;
}

export interface Listener {
  readonly notification: (notification: Notification) => void;
  readonly exit: (error: HarnessError) => void;
}

interface Envelope {
  readonly id?: number | string | null;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface Pending {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: HarnessError) => void;
}

const STDERR_TAIL_CHARS = 2_000;

export interface StartOptions {
  /**
   * The agent may ask the user questions as it works, not only in Plan
   * mode: an open Agent's server, never a Fork's, an Ask's or a catalog
   * read's, which nobody answers.
   */
  readonly questions?: boolean;
}

/** Codex asks questions in Default mode only with this feature on. */
const QUESTIONS_FEATURE = [
  '-c',
  'features.default_mode_request_user_input=true',
] as const;

/**
 * Spawns `codex app-server` in `cwd`, as the Harness Account, in a process
 * group of its own, and initializes it. Closing the Scope
 * shuts it down (see shutdown.ts).
 */
export const start = (
  cwd: string,
  options: StartOptions = {},
): Effect.Effect<AppServer, HarnessError, Scope.Scope | HarnessAccount> =>
  Effect.gen(function* () {
    const codex = yield* launcher;
    const child = yield* Effect.acquireRelease(
      Effect.try({
        try: () =>
          spawn(
            codex.command,
            [
              ...codex.args,
              'app-server',
              ...(options.questions === true ? QUESTIONS_FEATURE : []),
            ],
            {
              cwd,
              env: codex.env,
              stdio: ['pipe', 'pipe', 'pipe'],
              // Its own process group, so a kill reaches the Codex binary
              // behind an npm-installed `codex` launcher. Our exit still stops it: its input
              // ends.
              detached: true,
            },
          ),
        catch: (cause) =>
          new HarnessError({
            message: 'Could not start codex app-server',
            cause,
          }),
      }),
      (child) => shutdown(child),
    );

    const pending = new Map<number, Pending>();
    const listeners = new Set<Listener>();
    const takers = new Set<(request: QuestionRequest) => boolean>();
    let nextId = 1;
    let stderr = '';
    let exited: HarnessError | undefined;

    const write = (value: unknown) => {
      if (exited === undefined && child.stdin.writable)
        child.stdin.write(`${JSON.stringify(value)}\n`);
    };

    const exit = (error: HarnessError) => {
      if (exited !== undefined) return;
      exited = error;
      for (const call of pending.values()) call.reject(error);
      pending.clear();
      for (const listener of listeners) listener.exit(error);
    };

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL_CHARS);
    });
    const failedIn = { harness: 'Codex', cwd, binary: codex.path };
    child.once('error', (cause) =>
      exit(
        new HarnessError({
          message: failureReason(cause, failedIn, existsSync),
          cause,
        }),
      ),
    );
    child.once('exit', (exitCode, signal) => {
      const cause = { exitCode, signal, stderr };
      exit(
        new HarnessError({
          message: failureReason(cause, failedIn, existsSync),
          cause,
        }),
      );
    });

    createInterface({ input: child.stdout }).on('line', (line) => {
      let envelope: Envelope;
      try {
        envelope = JSON.parse(line) as Envelope;
      } catch {
        return;
      }
      const { id, method } = envelope;
      if (method === undefined && typeof id === 'number') {
        const call = pending.get(id);
        pending.delete(id);
        if (envelope.error === undefined) call?.resolve(envelope.result);
        else
          call?.reject(
            new HarnessError({
              message: `${call.method}: codex ${JSON.stringify(envelope.error)}`,
              cause: envelope.error,
            }),
          );
        return;
      }
      if (method === undefined) return;
      if (id !== undefined && id !== null) {
        if (
          method === 'item/tool/requestUserInput' &&
          options.questions === true
        ) {
          const request: QuestionRequest = {
            id,
            params: envelope.params as UserInputRequest,
            respond: (result) => write({ id, result }),
          };
          for (const take of takers) if (take(request)) return;
          write({ id, result: declined(envelope.params) });
          return;
        }
        write({ id, ...answer(method, envelope.params) });
        return;
      }
      const notification = { method, params: envelope.params };
      for (const listener of listeners) listener.notification(notification);
    });

    const request = <M extends RequestMethod>(
      method: M,
      params: Requests[M]['params'],
    ) =>
      Effect.callback<Requests[M]['result'], HarnessError>((resume) => {
        if (exited !== undefined) return resume(Effect.fail(exited));
        const id = nextId++;
        pending.set(id, {
          method,
          resolve: (value) =>
            resume(Effect.succeed(value as Requests[M]['result'])),
          reject: (error) => resume(Effect.fail(error)),
        });
        write({ id, method, params });
      });

    const server: AppServer = {
      request,
      listen: (listener) => {
        listeners.add(listener);
        if (exited !== undefined) listener.exit(exited);
        return () => listeners.delete(listener);
      },
      takeQuestions: (take) => {
        takers.add(take);
        return () => takers.delete(take);
      },
    };

    yield* request('initialize', {
      clientInfo: { name: 'ai-toolkit', title: 'AI Toolkit', version: '0.0.0' },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: DELTA_METHODS,
      },
    });
    write({ method: 'initialized', params: {} });
    return server;
  });

export { launcher, type Launcher } from './launcher.js';
export {
  isNotification,
  type BackgroundTerminal,
  type CollabAgentStatus,
  type CollabAgentTool,
  type McpServerConnectionStatus,
  type McpServerStatus,
  type Model,
  type Notification,
  type Notifications,
  type RateLimitSnapshot,
  type ReasoningEffort,
  type SandboxMode,
  type SandboxPolicy,
  type SkillMetadata,
  type ThreadItem,
  type ThreadTokenUsage,
  type TokenUsageBreakdown,
  type Turn,
  type TurnStatus,
  type UserInput,
  type UserInputQuestion,
  type UserInputRequest,
  type UserInputResponse,
} from './protocol.js';
