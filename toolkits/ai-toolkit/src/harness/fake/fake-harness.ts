import {
  Cause,
  Deferred,
  Effect,
  Layer,
  Queue,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  HarnessAccount,
  HarnessError,
  Harnesses,
  OneShotPrompt,
  type AskInput,
  type BackgroundJob,
  type ForkInput,
  type Harness,
  type AgentConfig,
  type RawOut,
  type Skill,
  type TurnInput,
  type TurnHandle,
  type TurnOut,
} from '../contract/index.js';
import type {
  AgentQuestion,
  QuestionAnswer,
} from '../../contract/wire/index.js';

/*
 * A harness for tests, named `claude`. Each turn emits `echo:<text>` at once,
 * or, slow to start, once `begin()` says so. By default it then ends with a
 * `result` and its `TurnEnd`; held, it waits for `finish()`. A steer joins
 * its own turn once that turn has started: its `TurnSteered`, then
 * `steer:<text>`; it fails once the turn has ended or another runs. A
 * cancel ends the
 * turn without a result or `TurnEnd`, as an interrupted agent would. A
 * turn's Fork Point is `<nativeId>:turn-<n>`.
 *
 * The rest answers at once and the same way every time: a fork is
 * `<nativeId>-fork`, an Ask echoes its question, Background Jobs,
 * Agent-started Turns and Agent Questions happen only when a test makes
 * them. An Agent Question is asked only while a turn of its agent runs; it
 * goes once answered or declined, and every one goes when the turn ends,
 * cancelled or not. Answering one no longer asked fails.
 */

const Text = Schema.Struct({ text: Schema.String });

export const FAKE_SKILLS: ReadonlyArray<Skill> = [
  { name: 'review', description: 'Reviews the diff', argumentHint: '[focus]' },
  { name: 'explain', description: 'Explains the code' },
];

/** One turn, from when it is asked for. */
interface FakeTurn {
  readonly agent: FakeAgent;
  readonly id: string;
  /** Opens when the turn may start: true to run, false when cancelled first. */
  readonly gate: Deferred.Deferred<boolean, HarnessError>;
  /** Done once the turn has started, so steers can join it. */
  readonly started: Deferred.Deferred<void, HarnessError>;
  queue: Queue.Queue<TurnOut, HarnessError | Cause.Done> | undefined;
  ended: boolean;
}

/** One opened agent, as tests drive it. */
interface FakeAgent {
  readonly jobs: SubscriptionRef.SubscriptionRef<ReadonlyArray<BackgroundJob>>;
  readonly agentTurns: Queue.Queue<TurnHandle>;
  readonly questions: SubscriptionRef.SubscriptionRef<
    ReadonlyArray<AgentQuestion>
  >;
}

export interface FakeHarness {
  readonly harness: Harness;
  readonly layer: Layer.Layer<Harnesses | OneShotPrompt>;
  /** Every open, with what it was opened with. */
  readonly opens: Array<AgentConfig>;
  /** The Harness Account each open ran as. */
  readonly accounts: Array<HarnessAccount['Service']>;
  /** How many agents were closed. */
  readonly closes: () => number;
  /** Every turn and steer, with what it carried. */
  readonly inputs: Array<TurnInput>;
  /** Every fork asked for. */
  readonly forks: Array<ForkInput>;
  /** Every Ask put. */
  readonly asks: Array<AskInput>;
  /** Every One-shot Prompt, with its text. */
  readonly prompts: Array<string>;
  /** Whether each One-shot Prompt had a Harness Account to run as. */
  readonly promptAccounts: Array<boolean>;
  /** Every Background Job stopped, by id. */
  readonly stoppedJobs: Array<string>;
  /** Every Agent Question answered, by id; a null answer declined it. */
  readonly answers: Array<{
    readonly id: string;
    readonly answer: QuestionAnswer | null;
  }>;
  /** Lets a turn that is slow to start emit its first record. */
  readonly begin: Effect.Effect<void>;
  /** Ends the running turn with a `result`. */
  readonly finish: Effect.Effect<void>;
  /** Fails the running turn, or the one waiting to start. */
  readonly fail: (message: string) => Effect.Effect<void>;
  /** Emits a record into the running turn, as the agent would. */
  readonly emit: (out: RawOut) => Effect.Effect<void>;
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
  /**
   * Has the agent opened as `nativeId` ask an Agent Question, while a turn
   * of its runs; nothing otherwise.
   */
  readonly askQuestion: (
    nativeId: string,
    question: AgentQuestion,
  ) => Effect.Effect<void>;
}

export const makeFakeHarness = (
  options: {
    /** Turns wait for `finish()` instead of ending at once. */
    readonly hold?: boolean;
    /** What a One-shot Prompt answers; a failure when undefined. */
    readonly oneShot?: string;
    /** The agent ignores a cancel. */
    readonly stubborn?: boolean;
    /** Turns wait for `begin()` before their first record. */
    readonly slowStart?: boolean;
    /** A steer returns a while after the agent took it. */
    readonly slowSteer?: boolean;
    /** The agent refuses to stop any Background Job. */
    readonly refuseStops?: boolean;
    /** The agent refuses every answer to an Agent Question. */
    readonly refuseAnswers?: boolean;
  } = {},
): FakeHarness => {
  const opens: Array<AgentConfig> = [];
  const accounts: Array<HarnessAccount['Service']> = [];
  const inputs: Array<TurnInput> = [];
  const forks: Array<ForkInput> = [];
  const asks: Array<AskInput> = [];
  const prompts: Array<string> = [];
  const promptAccounts: Array<boolean> = [];
  const stoppedJobs: Array<string> = [];
  const answers: FakeHarness['answers'] = [];
  const agents = new Map<string, FakeAgent>();
  let closed = 0;
  let turns = 0;
  /** The turn last asked for, until the next one is. */
  let running: FakeTurn | undefined;

  const end = () => {
    if (!running?.queue || running.ended) return;
    running.ended = true;
    Queue.offerUnsafe(running.queue, { kind: 'result', payload: {} });
    Queue.offerUnsafe(running.queue, {
      _tag: 'TurnEnd',
      status: 'done',
      forkPoint: running.id,
      shown: true,
    });
    Queue.endUnsafe(running.queue);
  };

  /**
   * One turn: `text` once it starts, then a result unless held. A user turn
   * is the running one from when it is asked for; an agent's, from when its
   * stream is read.
   */
  const turnOf = (
    agent: FakeAgent,
    nativeId: string,
    text: string,
    asked: boolean,
  ): TurnHandle => {
    const turn: FakeTurn = {
      agent,
      id: `${nativeId}:turn-${++turns}`,
      gate: Deferred.makeUnsafe(),
      started: Deferred.makeUnsafe(),
      queue: undefined,
      ended: false,
    };
    if (asked) running = turn;
    if (!options.slowStart)
      Deferred.doneUnsafe(turn.gate, Effect.succeed(true));
    const out = Stream.unwrap(
      Effect.gen(function* () {
        running = turn;
        const go = yield* Deferred.await(turn.gate).pipe(
          Effect.tapError((error) => {
            turn.ended = true;
            return Deferred.fail(turn.started, error);
          }),
        );
        const queue = yield* Queue.unbounded<
          TurnOut,
          HarnessError | Cause.Done
        >();
        turn.queue = queue;
        if (go) Queue.offerUnsafe(queue, { kind: 'text', payload: { text } });
        else {
          turn.ended = true;
          Queue.endUnsafe(queue);
        }
        if (go && !options.hold) end();
        yield* Deferred.succeed(turn.started, undefined);
        return Stream.fromQueue(queue).pipe(
          Stream.ensuring(
            Effect.andThen(
              Effect.sync(() => {
                turn.ended = true;
              }),
              // Its Agent Questions go with it.
              SubscriptionRef.set(agent.questions, []),
            ),
          ),
        );
      }),
    );
    const steer = (id: string, input: TurnInput) =>
      Effect.gen(function* () {
        yield* Deferred.await(turn.started);
        if (turn.ended || running !== turn || !turn.queue)
          return yield* new HarnessError({ message: 'The turn ended' });
        inputs.push(input);
        Queue.offerUnsafe(turn.queue, { _tag: 'TurnSteered', id });
        Queue.offerUnsafe(turn.queue, {
          kind: 'text',
          payload: { text: `steer:${input.text}` },
        });
        if (options.slowSteer) yield* Effect.sleep('50 millis');
      });
    return { out, steer };
  };

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
        accounts.push(yield* HarnessAccount);
        const nativeId = config.nativeId ?? `native-${opens.length}`;
        const agent: FakeAgent = {
          jobs: yield* SubscriptionRef.make<ReadonlyArray<BackgroundJob>>([]),
          agentTurns: yield* Queue.unbounded<TurnHandle>(),
          questions: yield* SubscriptionRef.make<ReadonlyArray<AgentQuestion>>(
            [],
          ),
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
            return turnOf(agent, nativeId, `echo:${input.text}`, true);
          },
          cancel: Effect.sync(() => {
            if (!running || running.ended || options.stubborn) return;
            if (running.queue) {
              running.ended = true;
              Queue.endUnsafe(running.queue);
            } else Deferred.doneUnsafe(running.gate, Effect.succeed(false));
          }),
          agentTurns: Stream.fromQueue(agent.agentTurns),
          backgroundJobs: SubscriptionRef.changes(agent.jobs),
          questions: SubscriptionRef.changes(agent.questions),
          answer: (id, answer) =>
            options.refuseAnswers
              ? Effect.fail(new HarnessError({ message: `${id} is refused` }))
              : SubscriptionRef.modify(agent.questions, (asked) =>
                  asked.some((question) => question.id === id)
                    ? [true, asked.filter((question) => question.id !== id)]
                    : [false, asked],
                ).pipe(
                  Effect.flatMap((was) => {
                    if (!was)
                      return Effect.fail(
                        new HarnessError({
                          message: `No question ${id} is asked`,
                        }),
                      );
                    answers.push({ id, answer });
                    return Effect.void;
                  }),
                ),
          stopBackgroundJob: (id) =>
            Effect.suspend(() => {
              if (options.refuseStops)
                return Effect.fail(
                  new HarnessError({ message: `job ${id} cannot be stopped` }),
                );
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
      const configured = (yield* HarnessAccount).binary;
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
    Layer.succeed(OneShotPrompt, {
      prompt: (text) =>
        Effect.gen(function* () {
          prompts.push(text);
          const given = yield* Effect.serviceOption(HarnessAccount);
          promptAccounts.push(given._tag === 'Some');
          if (options.oneShot === undefined)
            return yield* new HarnessError({
              message: 'no One-shot Prompts here',
            });
          return options.oneShot;
        }),
    }),
  );

  const agentOf = (nativeId: string) => Effect.sync(() => agents.get(nativeId));

  return {
    harness,
    layer,
    opens,
    accounts,
    closes: () => closed,
    inputs,
    forks,
    asks,
    prompts,
    promptAccounts,
    stoppedJobs,
    answers,
    begin: Effect.sync(() => {
      if (running) Deferred.doneUnsafe(running.gate, Effect.succeed(true));
    }),
    finish: Effect.sync(end),
    fail: (message) =>
      Effect.sync(() => {
        if (!running || running.ended) return;
        const error = new HarnessError({ message });
        if (!running.queue) {
          Deferred.doneUnsafe(running.gate, Effect.fail(error));
          return;
        }
        running.ended = true;
        Queue.failCauseUnsafe(running.queue, Cause.fail(error));
      }),
    emit: (out) =>
      Effect.sync(() => {
        if (running?.queue && !running.ended)
          Queue.offerUnsafe(running.queue, out);
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
              turnOf(agent, nativeId, `agent:${text}`, false),
            ).pipe(Effect.asVoid)
          : Effect.void,
      ),
    askQuestion: (nativeId, question) =>
      Effect.flatMap(agentOf(nativeId), (agent) =>
        agent && running?.agent === agent && !running.ended
          ? SubscriptionRef.update(agent.questions, (asked) => [
              ...asked,
              question,
            ])
          : Effect.void,
      ),
  };
};
