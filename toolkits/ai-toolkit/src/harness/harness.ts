import type { Effect, Scope, Stream } from 'effect';
import { Context, Data } from 'effect';
import type { Projected } from '../projection/index.js';
import type { HarnessName, Json, Raw } from '../raw/index.js';

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

/** A live agent session in one folder. Closing its Scope stops the agent. */
export interface HarnessSession {
  /** The harness's own session id, once it has one. */
  readonly nativeId: Effect.Effect<string | undefined>;
  /** Runs one turn: every whole record until the agent is idle again. */
  readonly turn: (text: string) => Stream.Stream<RawOut, HarnessError>;
  /** A user message while a turn runs; it joins that turn. */
  readonly steer: (text: string) => Effect.Effect<void, HarnessError>;
  /** Stops the running turn; its stream ends. */
  readonly cancel: Effect.Effect<void>;
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
    HarnessError
  >;
  readonly settings: ReadonlyArray<Setting>;
  readonly open: (
    config: OpenConfig,
  ) => Effect.Effect<HarnessSession, HarnessError, Scope.Scope>;
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

/** Writes a short title for a session from its first message. */
export class Titler extends Context.Service<
  Titler,
  { readonly title: (text: string) => Effect.Effect<string, HarnessError> }
>()('@kestack/ai-toolkit/Titler') {}
