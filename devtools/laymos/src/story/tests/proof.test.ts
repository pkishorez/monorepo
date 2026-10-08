import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import type { CapturedTrace } from '@kstackz/effect-tracer/recorder';

import { Gesture, isProof, Proof, type ProofHost } from '../index.js';

function fakeHost() {
  const events: string[] = [];
  const values: unknown[] = [];
  let trace: (() => CapturedTrace) | null = null;
  const host: ProofHost = {
    trace: (snapshot) => {
      trace = snapshot;
    },
    enter: (phase) => events.push(`enter ${phase}`),
    assert: (description, passed) =>
      events.push(`${passed ? 'pass' : 'fail'} ${description}`),
    exit: (phase, outcome) => {
      events.push(`exit ${phase} ${outcome._tag}`);
      if (outcome._tag === 'Success') values.push(outcome.value);
    },
    browser: null,
  };
  return { host, events, values, trace: () => trace?.() };
}

const signal = () => new AbortController().signal;

describe('Proof.make', () => {
  test('runs the three phases in order and hands each value on', async () => {
    const { host, events, values } = fakeHost();
    const proof = Proof.make({
      title: 'doubling',
      prepare: Effect.succeed(21),
      act: (state) => Effect.succeed(state * 2),
      verify: (output, state) =>
        Proof.assert('doubled', output === 42 && state === 21),
    });

    await proof.run(host, signal());

    expect(events).toEqual([
      'enter prepare',
      'exit prepare Success',
      'enter act',
      'exit act Success',
      'enter verify',
      'pass doubled',
      'exit verify Success',
    ]);
    expect(values).toEqual([21, 42, undefined]);
  });

  test('a false Preparation assertion stops before the Action', async () => {
    const { host, events } = fakeHost();
    const proof = Proof.make({
      title: 'unprepared',
      prepare: Proof.assert('ready', false),
      act: () => Effect.die('must not run'),
      verify: () => Effect.void,
    });

    await proof.run(host, signal());

    expect(events).toEqual([
      'enter prepare',
      'fail ready',
      'exit prepare Success',
    ]);
  });

  test('a dying phase reports its cause and stops the run', async () => {
    const { host, events } = fakeHost();
    const proof = Proof.make({
      title: 'dies',
      prepare: Effect.succeed('ready'),
      act: () => Effect.fail(new Error('refused')),
      verify: () => Effect.void,
    });

    await proof.run(host, signal());

    expect(events.at(-1)).toBe('exit act Failure');
  });

  test('resources the Preparation acquires live until Verification ends', async () => {
    const { host, events } = fakeHost();
    const resource = { open: false };
    const proof = Proof.make({
      title: 'scoped',
      prepare: Effect.acquireRelease(
        Effect.sync(() => {
          resource.open = true;
          return resource;
        }),
        () =>
          Effect.sync(() => {
            resource.open = false;
          }),
      ),
      act: (state) => Effect.succeed(state.open),
      verify: (_, state) => Proof.assert('still open', state.open),
    });

    await proof.run(host, signal());

    expect(events).toContain('pass still open');
    expect(resource.open).toBe(false);
  });

  test('traces the run as Proof with one span per phase', async () => {
    const { host, trace } = fakeHost();
    const proof = Proof.make({
      title: 'traced',
      prepare: Effect.void,
      act: () => Effect.void.pipe(Effect.withSpan('work')),
      verify: () => Effect.void,
    });

    await proof.run(host, signal());

    const spans = trace()!.spans;
    const byId = new Map(spans.map((span) => [span.spanId, span]));
    const parentOf = (name: string) => {
      const span = spans.find((candidate) => candidate.name === name)!;
      return span.parentSpanId === null
        ? null
        : byId.get(span.parentSpanId)!.name;
    };
    expect(parentOf('Proof')).toBeNull();
    expect(parentOf('prepare')).toBe('Proof');
    expect(parentOf('act')).toBe('Proof');
    expect(parentOf('verify')).toBe('Proof');
    expect(parentOf('work')).toBe('act');
  });

  test('aborting the signal interrupts the run and runs its finalizers', async () => {
    const { host } = fakeHost();
    let finalized = false;
    const proof = Proof.make({
      title: 'hangs',
      prepare: Effect.addFinalizer(() =>
        Effect.sync(() => {
          finalized = true;
        }),
      ),
      act: () => Effect.never,
      verify: () => Effect.void,
    });
    const controller = new AbortController();

    const running = proof.run(host, controller.signal);
    setTimeout(() => controller.abort(), 20);

    await expect(running).rejects.toBeDefined();
    expect(finalized).toBe(true);
  });

  test('keeps title, description, venue, Critical mark, and timeout as plain data', () => {
    const proof = Proof.make({
      title: 'plain',
      description: 'about it',
      critical: true,
      timeout: '2 seconds',
      prepare: Effect.void,
      act: () => Effect.void,
      verify: () => Effect.void,
    });

    expect(isProof(proof)).toBe(true);
    expect(isProof({ title: 'not a proof' })).toBe(false);
    expect(proof).toMatchObject({
      title: 'plain',
      description: 'about it',
      venue: 'process',
      critical: true,
      timeout: 2000,
      page: null,
    });
  });
});

describe('Proof.budget', () => {
  test('asserts every matching span ended within the budget, and that one exists', async () => {
    const { host, events } = fakeHost();
    const proof = Proof.make({
      title: 'budget',
      prepare: Effect.void,
      act: () => Effect.void.pipe(Effect.withSpan('fast')),
      verify: () =>
        Effect.gen(function* () {
          yield* Proof.budget('fast', '1 second');
          yield* Proof.budget('missing', '1 second');
        }),
    });

    await proof.run(host, signal());

    expect(events.filter((event) => event.includes('span ended'))).toEqual([
      expect.stringMatching(/^pass every "fast" span ended within 1000ms/),
      'fail every "missing" span ended within 1000ms (none recorded)',
    ]);
  });
});

describe('Proof.browser', () => {
  test('is a browser Proof whose page is kept for the page host', () => {
    const page = () => {};
    const proof = Proof.browser({
      title: 'browser',
      page,
      prepare: (browser) => browser.open('mobile'),
      act: () => Effect.void,
      verify: () => Effect.void,
    });

    expect(proof.venue).toBe('browser');
    expect(proof.page).toBe(page);
  });
});

describe('Gesture', () => {
  test('carries durations as milliseconds', () => {
    expect(Gesture.pinch('#photo', 2, { duration: '1 second' })).toEqual({
      kind: 'pinch',
      target: '#photo',
      scale: 2,
      duration: 1000,
    });
    expect(Gesture.swipe('#list', 'up')).toMatchObject({
      distance: 200,
      fingers: 1,
    });
  });
});
