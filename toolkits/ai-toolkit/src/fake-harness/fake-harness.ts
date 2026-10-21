import {
  Cause,
  Effect,
  Layer,
  Queue,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  HarnessBinaries,
  HarnessError,
  Harnesses,
  Titler,
  type AskInput,
  type BackgroundJob,
  type ForkInput,
  type Harness,
  type OpenConfig,
  type RawOut,
  type Skill,
  type TurnInput,
} from '../harness/index.js';

/*
 * A harness for tests, named `claude`. Each turn emits `echo:<text>` at once.
 * By default it then ends with a `result`; held, it waits for `finish()`.
 * A steer emits `steer:<text>` into the running turn; a cancel ends the
 * turn without a result, as an interrupted agent would. A finished turn's
 * native id is `<nativeId>:turn-<n>`.
 *
 * The rest answers at once and the same way every time: a fork is
 * `<nativeId>-fork`, an Ask echoes its question, Background Jobs and
 * Agent-started Turns happen only when a test makes them.
 */

const Text = Schema.Struct({ text: Schema.String });

export const FAKE_SKILLS: ReadonlyArray<Skill> = [
  { name: 'review', description: 'Reviews the diff', argumentHint: '[focus]' },
  { name: 'explain', description: 'Explains the code' },
];

/** One opened agent, as tests drive it. */
interface FakeAgent {
  readonly jobs: SubscriptionRef.SubscriptionRef<ReadonlyArray<BackgroundJob>>;
  readonly agentTurns: Queue.Queue<Stream.Stream<RawOut, HarnessError>>;
  lastTurn: string | undefined;
}

export interface FakeHarness {
  readonly harness: Harness;
  readonly layer: Layer.Layer<Harnesses | Titler>;
  /** Every open, with what it was opened with. */
  readonly opens: Array<OpenConfig>;
  /** How many agents were closed. */
  readonly closes: () => number;
  /** Every turn and steer, with what it carried. */
  readonly inputs: Array<TurnInput>;
  /** Every fork asked for. */
  readonly forks: Array<ForkInput>;
  /** Every Ask put. */
  readonly asks: Array<AskInput>;
  /** Every call to the Titler, with the messages it was given. */
  readonly titles: Array<ReadonlyArray<string>>;
  /** Every Background Job stopped, by id. */
  readonly stoppedJobs: Array<string>;
  /** Ends the running turn with a `result`. */
  readonly finish: Effect.Effect<void>;
  /** Fails the running turn. */
  readonly fail: (message: string) => Effect.Effect<void>;
  /** Sets the Background Jobs of the agent opened as `nativeId`. */
  readonly setJobs: (
    nativeId: string,
    jobs: ReadonlyArray<BackgroundJob>,
  ) => Effect.Effect<void>;
  /**
   * Starts an Agent-started Turn on the agent opened as `nativeId`: it emits
   * `agent:<text>`, then ends like any turn.
   */
  readonly startAgentTurn: (
    nativeId: string,
    text: string,
  ) => Effect.Effect<void>;
}

export const makeFakeHarness = (
  options: {
    /** Turns wait for `finish()` instead of ending at once. */
    readonly hold?: boolean;
    /** What the Titler answers; a failure when undefined. */
    readonly title?: string;
    /** The agent ignores a cancel. */
    readonly stubborn?: boolean;
  } = {},
): FakeHarness => {
  const opens: Array<OpenConfig> = [];
  const inputs: Array<TurnInput> = [];
  const forks: Array<ForkInput> = [];
  const asks: Array<AskInput> = [];
  const titles: Array<ReadonlyArray<string>> = [];
  const stoppedJobs: Array<string> = [];
  const agents = new Map<string, FakeAgent>();
  let closed = 0;
  let turns = 0;
  let running:
    | {
        readonly queue: Queue.Queue<RawOut, HarnessError | Cause.Done>;
        readonly agent: FakeAgent;
        readonly id: string;
      }
    | undefined;

  const end = () => {
    if (!running) return;
    if (!Queue.offerUnsafe(running.queue, { kind: 'result', payload: {} }))
      return;
    Queue.endUnsafe(running.queue);
    running.agent.lastTurn = running.id;
  };

  /** One turn's records: `text` at once, then a result unless held. */
  const turnOf = (agent: FakeAgent, nativeId: string, text: string) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const queue = yield* Queue.unbounded<
          RawOut,
          HarnessError | Cause.Done
        >();
        running = { queue, agent, id: `${nativeId}:turn-${++turns}` };
        Queue.offerUnsafe(queue, { kind: 'text', payload: { text } });
        if (!options.hold) end();
        return Stream.fromQueue(queue);
      }),
    );

  const harness: Harness = {
    name: 'claude',
    label: 'Fake',
    modelsProvider: 'anthropic',
    acceptsModel: (id) => id.startsWith('claude-'),
    defaultModel: 'claude-test',
    settings: [
      {
        key: 'effort',
        label: 'Effort',
        choices: [{ value: 'high', label: 'High' }],
        default: 'high',
      },
    ],
    open: (config) =>
      Effect.gen(function* () {
        opens.push(config);
        const nativeId = config.nativeId ?? `native-${opens.length}`;
        const agent: FakeAgent = {
          jobs: yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]),
          agentTurns:
            yield* Queue.unbounded<Stream.Stream<RawOut, HarnessError>>(),
          lastTurn: undefined,
        };
        agents.set(nativeId, agent);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            closed++;
            if (agents.get(nativeId) === agent) agents.delete(nativeId);
          }),
        );
        return {
          nativeId: Effect.succeed(nativeId),
          turn: (input) => {
            inputs.push(input);
            return turnOf(agent, nativeId, `echo:${input.text}`);
          },
          steer: (input) =>
            Effect.sync(() => {
              inputs.push(input);
              if (running)
                Queue.offerUnsafe(running.queue, {
                  kind: 'text',
                  payload: { text: `steer:${input.text}` },
                });
            }),
          cancel: Effect.sync(() => {
            if (running && !options.stubborn) Queue.endUnsafe(running.queue);
          }),
          lastTurnNativeId: Effect.sync(() => agent.lastTurn),
          agentTurns: Stream.fromQueue(agent.agentTurns),
          backgroundJobs: SubscriptionRef.changes(agent.jobs),
          stopBackgroundJob: (id) =>
            Effect.suspend(() => {
              stoppedJobs.push(id);
              return SubscriptionRef.update(agent.jobs, (jobs) =>
                jobs.filter((job) => job.id !== id),
              );
            }),
          mcpStatus: Effect.succeed([
            { name: 'fake-mcp', status: 'connected', tools: 1 },
          ]),
          contextUsage: Effect.succeed({
            usedTokens: 1000,
            maxTokens: 200000,
            rateLimits: [],
          }),
        };
      }),
    skills: () => Effect.succeed(FAKE_SKILLS),
    fork: (input) =>
      Effect.sync(() => {
        forks.push(input);
        return { nativeId: `${input.nativeId}-fork` };
      }),
    ask: (input) =>
      Effect.sync(() => {
        asks.push(input);
        return input.schema === undefined
          ? { _tag: 'Text' as const, text: `answer:${input.question}` }
          : { _tag: 'Data' as const, data: { question: input.question } };
      }),
    // A configured path containing `missing` does not run.
    binary: Effect.gen(function* () {
      const binaries = yield* HarnessBinaries;
      const configured = yield* binaries.path('claude');
      if (configured?.includes('missing'))
        return {
          path: null,
          version: null,
          error: `${configured} not found`,
          isDefault: false,
        };
      return {
        path: configured ?? '/usr/local/bin/fake',
        version: 'fake 1.0.0',
        error: null,
        isDefault: configured === undefined,
      };
    }),
    project: (raw) => {
      if (raw.kind === 'result')
        return {
          agentId: null,
          role: 'system',
          parts: [{ type: 'turnEnded', status: 'done' }],
        };
      if (raw.kind === 'hidden') return null;
      const text = Schema.decodeUnknownOption(Text)(raw.payload);
      return text._tag === 'Some'
        ? {
            agentId: raw.agentId,
            role: 'assistant',
            parts: [{ type: 'text', text: text.value.text }],
          }
        : null;
    },
  };

  const layer = Layer.merge(
    Layer.succeed(Harnesses, {
      all: [harness],
      get: (name) => {
        if (name !== 'claude') throw new Error(`No harness ${name}`);
        return harness;
      },
    }),
    Layer.succeed(Titler, {
      title: (userMessages) =>
        Effect.suspend(() => {
          titles.push(userMessages);
          return options.title === undefined
            ? Effect.fail(new HarnessError({ message: 'no titles here' }))
            : Effect.succeed(options.title);
        }),
    }),
  );

  const agentOf = (nativeId: string) => Effect.sync(() => agents.get(nativeId));

  return {
    harness,
    layer,
    opens,
    closes: () => closed,
    inputs,
    forks,
    asks,
    titles,
    stoppedJobs,
    finish: Effect.sync(end),
    fail: (message) =>
      Effect.sync(() => {
        if (running)
          Queue.failCauseUnsafe(
            running.queue,
            Cause.fail(new HarnessError({ message })),
          );
      }),
    setJobs: (nativeId, jobs) =>
      Effect.flatMap(agentOf(nativeId), (agent) =>
        agent ? SubscriptionRef.set(agent.jobs, jobs) : Effect.void,
      ),
    startAgentTurn: (nativeId, text) =>
      Effect.flatMap(agentOf(nativeId), (agent) =>
        agent
          ? Queue.offer(
              agent.agentTurns,
              turnOf(agent, nativeId, `agent:${text}`),
            ).pipe(Effect.asVoid)
          : Effect.void,
      ),
  };
};
