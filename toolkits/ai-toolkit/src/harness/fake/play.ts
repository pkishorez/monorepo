import { Clock, Effect } from 'effect';
import type {
  AgentQuestion,
  QuestionAnswer,
} from '../../contract/wire/index.js';
import type { TurnOut } from '../contract/index.js';
import type { Script, Step } from './scripts.js';
import { piecesOf, type Ended, type Started, type Writer } from './writer.js';

/*
 * Plays a Script into one reply: every Step through the harness's Writer,
 * the pace between two pieces, and the waits. Steers the reply took are
 * said between two Steps, and at its end. Never fails: it gives how the
 * reply ended.
 */

/** What a reply plays on: its stream, its pace, and the world's Model. */
export interface Stage {
  readonly emit: (out: TurnOut) => Effect.Effect<void>;
  /** How long to wait between two pieces, in ms. */
  readonly pace: number;
  /** Asks `question`; waits for its answer, null if declined. */
  readonly ask: (
    question: AgentQuestion,
  ) => Effect.Effect<{ readonly answer: QuestionAnswer | null }>;
  /** The question is no longer asked. */
  readonly heard: Effect.Effect<void>;
  /** A Background Job started, as the Writer wrote it. */
  readonly jobStarted: (
    step: Extract<Step, { _tag: 'Job' }>,
    started: Started,
  ) => Effect.Effect<void>;
  readonly filled: (usedTokens: number) => Effect.Effect<void>;
  /** The steers taken since last asked, each to be said. */
  readonly steers: Effect.Effect<
    ReadonlyArray<{ readonly id: string; readonly text: string }>
  >;
}

/** What the agent heard, as it says it back. */
const heardOf = (
  question: AgentQuestion,
  answer: QuestionAnswer | null,
): string =>
  answer === null
    ? 'No answer, so I will carry on with what seems best.'
    : `You answered: ${question.items
        .map(
          (item) =>
            `${item.header}: ${item.secret ? '(hidden)' : (answer[item.id] ?? []).join(', ') || 'nothing'}`,
        )
        .join('; ')}.`;

export const play = (
  script: Script,
  writer: Writer,
  stage: Stage,
): Effect.Effect<Ended> => {
  let said = '';

  const emitAll = (outs: ReadonlyArray<TurnOut>) =>
    Effect.forEach(outs, stage.emit, { discard: true });

  /** Waits a while: the pace, unless given. */
  const wait = (ms?: number): Effect.Effect<void> =>
    Effect.sleep(ms ?? stage.pace);

  const write = (
    channel: 'text' | 'reasoning',
    text: string,
    by: Writer,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const { chunks, whole } = by.text(channel, piecesOf(text));
      for (const chunk of chunks) {
        yield* wait();
        yield* stage.emit(chunk);
      }
      yield* emitAll(whole);
      if (channel === 'text' && by === writer) said += text;
    });

  const ask = (
    step: Extract<Step, { _tag: 'Ask' }>,
    by: Writer,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const asked = by.ask(step, yield* Clock.currentTimeMillis);
      yield* emitAll(asked.records);
      const { answer } = yield* stage.ask(asked.question);
      yield* stage.heard;
      yield* emitAll(asked.answered(answer));
      yield* write('text', heardOf(asked.question, answer), by);
    });

  /** Says the steers taken, between two Steps. */
  const between: Effect.Effect<void> = Effect.gen(function* () {
    for (const steer of yield* stage.steers) {
      yield* stage.emit({ _tag: 'TurnSteered', id: steer.id });
      yield* write('text', `Noted: ${steer.text}`, writer);
    }
  });

  const run = (steps: ReadonlyArray<Step>, by: Writer): Effect.Effect<void> =>
    Effect.forEach(
      steps,
      (step) =>
        Effect.andThen(
          by === writer ? between : Effect.void,
          runStep(step, by),
        ),
      { discard: true },
    );

  const runStep = (step: Step, by: Writer): Effect.Effect<void> => {
    switch (step._tag) {
      case 'Say':
        return write('text', step.text, by);
      case 'Think':
        return write('reasoning', step.text, by);
      case 'Plan':
        return Effect.andThen(wait(), emitAll(by.plan(step)));
      case 'Subagent':
        return Effect.gen(function* () {
          const { call, child, report } = by.subagent(step);
          yield* wait();
          yield* emitAll(call);
          yield* run(step.steps, child);
          yield* write('text', step.report, child);
          yield* wait();
          yield* emitAll(report());
        });
      case 'Ask':
        return Effect.andThen(wait(), ask(step, by));
      case 'Job':
        return Effect.gen(function* () {
          const started = by.job(step);
          yield* wait();
          yield* emitAll(started.records);
          yield* stage.jobStarted(step, started);
        });
      case 'Compact':
        return Effect.andThen(wait(), emitAll(by.compact()));
      case 'Problem':
        return Effect.andThen(wait(), emitAll(by.problem(step.message)));
      case 'Fill':
        return stage.filled(step.usedTokens);
      case 'Pause':
        return wait(step.ms);
      default: {
        const { call, result } = by.tool(step);
        return Effect.gen(function* () {
          yield* wait();
          yield* emitAll(call);
          yield* wait();
          yield* emitAll(result);
        });
      }
    }
  };

  return Effect.gen(function* () {
    yield* emitAll(writer.opens());
    yield* run(script.steps, writer);
    yield* between;
    return writer.ends(script.ending, script.usage, said);
  });
};

/** A reply whose login is gone: it opens, and fails as the harness does. */
export const loggedOut = (writer: Writer): Ended => {
  const ended = writer.ends(
    { _tag: 'LoggedOut' },
    { input: 0, output: 0, cacheRead: 0 },
    '',
  );
  return { records: [...writer.opens(), ...ended.records], end: ended.end };
};
