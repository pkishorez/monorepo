import type { Scope, Stream } from 'effect';
import { Context, Data, Effect, Layer } from 'effect';
import type {
  AgentQuestion,
  AskAnswer,
  Attachment,
  BackgroundJob,
  BinaryInfo,
  ContextUsage,
  McpServerStatus,
  QuestionAnswer,
  Skill,
} from '../../contract/wire/index.js';
import type {
  Projected,
  TurnEndStatus,
} from '../../contract/projection/index.js';
import type { HarnessName, Json, Raw } from '../../contract/raw/index.js';

export type {
  AgentQuestion,
  AskAnswer,
  Attachment,
  BackgroundJob,
  BinaryInfo,
  ContextUsage,
  McpServerStatus,
  QuestionAnswer,
  Skill,
} from '../../contract/wire/index.js';

export class HarnessError extends Data.TaggedError('HarnessError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** The Agent Question is no longer asked: answered, declined, or its Turn ended. */
export class QuestionNotAsked extends Data.TaggedError('QuestionNotAsked')<{
  readonly id: string;
}> {}

/** One whole record as a harness emits it; the engine stamps the rest of Raw. */
export interface RawOut {
  readonly kind: string;
  readonly payload: Json;
  /** The spawning tool call id when this came from a subagent; omitted for the main agent. */
  readonly agentId?: string;
}

/** One agent-specific setting, described so any client can draw a picker for it. */
export interface Setting {
  readonly key: string;
  readonly label: string;
  readonly choices: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
  readonly default: string;
}

/** What an Agent is opened with. */
export interface AgentConfig {
  readonly cwd: string;
  readonly model: string;
  /** Values for the harness's Settings, by key; a missing key takes its default. */
  readonly settings: Readonly<Record<string, string>>;
  /** The Agent's Native Id, to resume its context. */
  readonly nativeId?: string;
}

/** What one user message carries into a Turn. */
export interface TurnInput {
  readonly text: string;
  /** Images only: the engine saves any other Attachment and names it in `text`. */
  readonly images: ReadonlyArray<Attachment>;
  /** The Language Model from this Turn on; omitted keeps the current one. */
  readonly model?: string;
  /** Setting values from this Turn on; omitted keeps the current ones. */
  readonly settings?: Readonly<Record<string, string>>;
}

/** The agent took a steer: it joins the turn here, in the turn's order. */
export interface TurnSteered {
  readonly _tag: 'TurnSteered';
  /** The id the steer was sent with. */
  readonly id: string;
}

/** How the turn ended: always its stream's last element, when it has one. */
export interface TurnEnd {
  readonly _tag: 'TurnEnd';
  readonly status: TurnEndStatus;
  readonly error?: string;
  /** This turn's Fork Point, as the harness's `fork` takes it. */
  readonly forkPoint?: string;
  /** The record just before already shows this end, so the engine's does not. */
  readonly shown: boolean;
}

/**
 * What a turn's stream carries, in order: the agent's records, each steer
 * where the agent took it, and its end (ADR 0013).
 */
export type TurnOut = RawOut | TurnSteered | TurnEnd;

/** A turn's stream: whatever ends it, a stream that fails failed. */
export type TurnStream = Stream.Stream<TurnOut, HarnessError>;

/** A record of the agent's, not a fact about the turn. */
export const isRecord = (out: TurnOut): out is RawOut => !('_tag' in out);

/** One turn: its stream, and the way to steer it and nothing else. */
export interface TurnHandle {
  /**
   * Every whole record until the agent is idle again, then the turn's
   * `TurnEnd`. A stream that ends without one was cancelled.
   */
  readonly out: TurnStream;
  /**
   * A user message for this turn, by the engine's `id`: it waits until the
   * turn has started, then the agent takes it and `out` says so with a
   * `TurnSteered`, before anything the agent does with it and before `out`
   * ends. It is refused once this turn has ended, or while the agent runs
   * another. A steer whose `TurnSteered` never came was not taken, whether
   * or not this fails; the engine runs it as the next turn.
   */
  readonly steer: (
    id: string,
    input: TurnInput,
  ) => Effect.Effect<void, HarnessError>;
}

/**
 * A Coding Harness's agent in one folder, open while its process runs.
 * Closing its Scope stops it. It runs one Turn at a time; how its Turns are
 * ordered is the caller's business.
 */
export interface Agent {
  /** The Agent's Native Id, once it has one. */
  readonly nativeId: Effect.Effect<string | undefined>;
  /** Asks for one turn; it runs as its `out` is read. */
  readonly turn: (input: TurnInput) => TurnHandle;
  /** Stops the running turn; its stream ends. */
  readonly cancel: Effect.Effect<void>;
  /**
   * Agent-started Turns, each a handle like `turn`'s. The harness emits one
   * only while no user Turn runs.
   */
  readonly agentTurns: Stream.Stream<TurnHandle>;
  /** The agent's Background Jobs, the current list first, then each change. */
  readonly backgroundJobs: Stream.Stream<ReadonlyArray<BackgroundJob>>;
  readonly stopBackgroundJob: (id: string) => Effect.Effect<void, HarnessError>;
  /**
   * The Agent Questions the running Turn waits on, the current list first,
   * then each change. One goes once answered or declined, and every one
   * goes when its Turn ends.
   */
  readonly questions: Stream.Stream<ReadonlyArray<AgentQuestion>>;
  /**
   * Answers an Agent Question by its id, or declines it with null, so the
   * agent carries on without an answer. QuestionNotAsked once it is no
   * longer asked.
   */
  readonly answer: (
    id: string,
    answer: QuestionAnswer | null,
  ) => Effect.Effect<void, HarnessError | QuestionNotAsked>;
  readonly mcpStatus: Effect.Effect<
    ReadonlyArray<McpServerStatus>,
    HarnessError
  >;
  readonly contextUsage: Effect.Effect<ContextUsage, HarnessError>;
}

export interface ForkInput {
  readonly cwd: string;
  /** The Agent's Native Id. */
  readonly nativeId: string;
  /** The Fork Point: a Turn's `nativeTurnId`; omitted forks at the latest. */
  readonly at?: string;
}

export interface AskInput {
  readonly cwd: string;
  /** The Agent's Native Id. */
  readonly nativeId: string;
  readonly model: string;
  readonly question: string;
  /** A JSON Schema the answer must match; omitted answers in text. */
  readonly schema?: Json;
}

/** A model this machine's login can run, as the harness lists it. */
export interface AvailableModel {
  readonly id: string;
  readonly name?: string;
  /** The model the harness picks when none is asked for. */
  readonly isDefault?: boolean;
}

export interface Harness {
  readonly name: HarnessName;
  readonly label: string;
  /** Which models.dev provider lists this harness's models. */
  readonly modelsProvider: 'anthropic' | 'openai';
  /** Whether a models.dev model id is one this harness accepts. */
  readonly acceptsModel: (modelId: string) => boolean;
  /** Used when the account names no default, or cannot be asked. */
  readonly defaultModel: string;
  /**
   * The models this machine's login can actually run. Optional: without it
   * the models.dev models `acceptsModel` allows are listed instead.
   */
  readonly availableModels?: Effect.Effect<
    ReadonlyArray<AvailableModel>,
    HarnessError,
    HarnessAccount
  >;
  readonly settings: ReadonlyArray<Setting>;
  /**
   * Opens an Agent once its process has started and initialized; one that
   * exits or fails before then fails the open, with why.
   */
  readonly open: (
    config: AgentConfig,
  ) => Effect.Effect<Agent, HarnessError, Scope.Scope | HarnessAccount>;
  /** The Skills this harness offers in a folder; no Turn needed. */
  readonly skills: (
    cwd: string,
  ) => Effect.Effect<ReadonlyArray<Skill>, HarnessError, HarnessAccount>;
  /** A new Agent with a copy of the context up to a Fork Point. */
  readonly fork: (
    input: ForkInput,
  ) => Effect.Effect<
    { readonly nativeId: string },
    HarnessError,
    HarnessAccount
  >;
  /**
   * Answers a question from an Agent's context in a throwaway fork: read
   * only, one turn, never kept.
   */
  readonly ask: (
    input: AskInput,
  ) => Effect.Effect<AskAnswer, HarnessError, HarnessAccount>;
  /** The Harness Binary this harness runs, and whether it runs. */
  readonly binary: Effect.Effect<BinaryInfo, never, HarnessAccount>;
  /** Pure: one Raw record this harness wrote, to its projected form or null. */
  readonly project: (raw: Raw) => Projected | null;
}

/** Every Coding Harness this server runs, by name. */
export class Harnesses extends Context.Service<
  Harnesses,
  {
    readonly all: ReadonlyArray<Harness>;
    readonly get: (name: HarnessName) => Harness;
  }
>()('@kestack/ai-toolkit/Harnesses') {}

/**
 * The Harness Account a harness call runs as: which Harness Binary, and
 * which config folder it keeps its login, settings and transcripts in.
 * The caller gives one with every call that starts a harness process.
 */
export class HarnessAccount extends Context.Service<
  HarnessAccount,
  {
    /** The executable to run; undefined runs the harness's name from PATH. */
    readonly binary: string | undefined;
    /**
     * Its config folder, as `CLAUDE_CONFIG_DIR` or `CODEX_HOME`; undefined
     * leaves the harness's own default.
     */
    readonly configFolder: string | undefined;
  }
>()('@kestack/ai-toolkit/HarnessAccount') {
  /** The installed harness from PATH, on its own config folder. */
  static readonly layerDefault: Layer.Layer<HarnessAccount> = Layer.succeed(
    HarnessAccount,
    { binary: undefined, configFolder: undefined },
  );
}

/**
 * The reply to a prompt from a Coding Harness with no Agent behind it:
 * read-only, no tools, nothing kept.
 */
export class OneShotPrompt extends Context.Service<
  OneShotPrompt,
  {
    readonly prompt: (text: string) => Effect.Effect<string, HarnessError>;
  }
>()('@kestack/ai-toolkit/OneShotPrompt') {}
