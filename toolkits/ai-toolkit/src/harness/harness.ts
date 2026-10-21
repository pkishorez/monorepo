import type { Scope, Stream } from 'effect';
import { Context, Data, Effect, Layer } from 'effect';
import type {
  AskAnswer,
  Attachment,
  BackgroundJob,
  BinaryInfo,
  ContextUsage,
  McpServerStatus,
  Skill,
} from '../harness-wire/index.js';
import type { Projected } from '../projection/index.js';
import type { HarnessName, Json, Raw } from '../raw/index.js';

export type {
  AskAnswer,
  Attachment,
  BackgroundJob,
  BinaryInfo,
  ContextUsage,
  McpServerStatus,
  Skill,
} from '../harness-wire/index.js';

export class HarnessError extends Data.TaggedError('HarnessError')<{
  readonly message: string;
  readonly cause?: unknown;
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

export interface OpenConfig {
  readonly cwd: string;
  readonly model: string;
  /** Values for the harness's Settings, by key; a missing key takes its default. */
  readonly settings: Readonly<Record<string, string>>;
  /** The harness's own session id, to resume its context. */
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

/** A live agent session in one folder. Closing its Scope stops the agent. */
export interface HarnessSession {
  /** The harness's own session id, once it has one. */
  readonly nativeId: Effect.Effect<string | undefined>;
  /** Runs one turn: every whole record until the agent is idle again. */
  readonly turn: (input: TurnInput) => Stream.Stream<RawOut, HarnessError>;
  /** A user message while a turn runs; it joins that turn. */
  readonly steer: (input: TurnInput) => Effect.Effect<void, HarnessError>;
  /** Stops the running turn; its stream ends. */
  readonly cancel: Effect.Effect<void>;
  /**
   * The Native Id of the last finished Turn's Fork Point, read when a Turn
   * ends; undefined before any Turn finished.
   */
  readonly lastTurnNativeId: Effect.Effect<string | undefined>;
  /**
   * Agent-started Turns, each a stream like `turn`'s. The harness emits one
   * only while no user Turn runs.
   */
  readonly agentTurns: Stream.Stream<Stream.Stream<RawOut, HarnessError>>;
  /** The agent's Background Jobs, the current list first, then each change. */
  readonly backgroundJobs: Stream.Stream<ReadonlyArray<BackgroundJob>>;
  readonly stopBackgroundJob: (id: string) => Effect.Effect<void, HarnessError>;
  readonly mcpStatus: Effect.Effect<
    ReadonlyArray<McpServerStatus>,
    HarnessError
  >;
  readonly contextUsage: Effect.Effect<ContextUsage, HarnessError>;
}

export interface ForkInput {
  readonly cwd: string;
  /** The Session's Native Id. */
  readonly nativeId: string;
  /** The Fork Point: a Turn's `nativeTurnId`; omitted forks at the latest. */
  readonly at?: string;
}

export interface AskInput {
  readonly cwd: string;
  /** The Session's Native Id. */
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
    HarnessBinaries
  >;
  readonly settings: ReadonlyArray<Setting>;
  readonly open: (
    config: OpenConfig,
  ) => Effect.Effect<
    HarnessSession,
    HarnessError,
    Scope.Scope | HarnessBinaries
  >;
  /** The Skills this harness offers in a folder; no Turn needed. */
  readonly skills: (
    cwd: string,
  ) => Effect.Effect<ReadonlyArray<Skill>, HarnessError, HarnessBinaries>;
  /** A new native session with a copy of the context up to a Fork Point. */
  readonly fork: (
    input: ForkInput,
  ) => Effect.Effect<
    { readonly nativeId: string },
    HarnessError,
    HarnessBinaries
  >;
  /**
   * Answers a question from a session's context in a throwaway fork: read
   * only, one turn, never kept.
   */
  readonly ask: (
    input: AskInput,
  ) => Effect.Effect<AskAnswer, HarnessError, HarnessBinaries>;
  /** The Harness Binary this harness runs, and whether it runs. */
  readonly binary: Effect.Effect<BinaryInfo, never, HarnessBinaries>;
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
 * The Harness Binary each harness is set to run; undefined for its default.
 * Harnesses read it every time they start a process.
 */
export class HarnessBinaries extends Context.Service<
  HarnessBinaries,
  {
    readonly path: (harness: HarnessName) => Effect.Effect<string | undefined>;
  }
>()('@kestack/ai-toolkit/HarnessBinaries') {
  /** Every harness on its default binary, as tests and the CLI start. */
  static readonly layerDefault: Layer.Layer<HarnessBinaries> = Layer.succeed(
    HarnessBinaries,
    { path: () => Effect.succeed(undefined) },
  );
}

/** Writes a short title for a session from its latest user messages, oldest first. */
export class Titler extends Context.Service<
  Titler,
  {
    readonly title: (
      userMessages: ReadonlyArray<string>,
    ) => Effect.Effect<string, HarnessError>;
  }
>()('@kestack/ai-toolkit/Titler') {}
