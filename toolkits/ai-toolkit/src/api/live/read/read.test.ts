import { Effect, Fiber, Layer, Schema, Stream } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type { RawOut } from '../../../harness/index.js';
import { makeFakeHarness } from '../../../fake-harness/index.js';
import { MessageSchema, type Message } from '../../../projection/index.js';
import { Store } from '../../../store/index.js';
import type { WireEntity } from '../../contract/index.js';
import { messages, projects } from './index.js';

let n = 0;
const raw = (out: RawOut & { readonly harness?: 'claude' | 'engine' }) => ({
  id: `raw-${String(++n).padStart(5, '0')}`,
  sessionId: 's1',
  turnId: 't1',
  harness: out.harness ?? 'claude',
  kind: out.kind,
  agentId: null,
  payload: out.payload,
  at: n,
});
const text = (value: string) => raw({ kind: 'text', payload: { text: value } });

const layer = Layer.merge(Store.layer(':memory:'), makeFakeHarness().layer);

const run = <A, E>(effect: Effect.Effect<A, E, any>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(layer)) as Effect.Effect<A, E>,
  );

const decode = Schema.decodeUnknownSync(MessageSchema.entity);
const texts = (wires: ReadonlyArray<WireEntity>) =>
  wires.map((wire) => {
    const part = (decode(wire).value as Message).parts[0];
    return part?.type === 'text' ? part.text : part?.type;
  });

/** Collects a feed's batches as they come, until the test is done with it. */
const collect = (
  stream: Stream.Stream<ReadonlyArray<WireEntity>, never, any>,
) =>
  Effect.gen(function* () {
    const got: Array<WireEntity> = [];
    const fiber = yield* Effect.forkScoped(
      Stream.runForEach(stream, (batch) =>
        Effect.sync(() => void got.push(...batch)),
      ),
    );
    return { got, fiber };
  });

const eventually = (assertion: () => void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 3000, interval: 5 }));

describe('the messages feed', () => {
  it('projects each Raw to a Message with its id and meta, and leaves out the nulls', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        const started = yield* store.appendRaw(
          raw({
            harness: 'engine',
            kind: 'turn.started',
            payload: { text: 'hi', steered: false },
          }),
        );
        yield* store.appendRaw(raw({ kind: 'hidden', payload: {} }));
        yield* store.appendRaw(text('hello'));
        yield* store.appendRaw(raw({ kind: 'result', payload: {} }));

        const { got } = yield* collect(messages('s1', null));
        yield* eventually(() => expect(got).toHaveLength(3));
        expect(texts(got)).toEqual(['turnStarted', 'hello', 'turnEnded']);
        expect(got[0]).toMatchObject({
          value: { id: started.value.id, role: 'user' },
          meta: {
            _e: 'AiMessage',
            _v: MessageSchema.latestVersion,
            _u: started.meta._u,
            _d: false,
          },
        });
      }),
    ));

  it('sends only what changed after the cursor', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        for (const each of ['a', 'b', 'c']) yield* store.appendRaw(text(each));
        const first = yield* collect(messages('s1', null));
        yield* eventually(() => expect(first.got).toHaveLength(3));
        yield* Fiber.interrupt(first.fiber);

        yield* store.appendRaw(text('d'));
        const resumed = yield* collect(messages('s1', first.got[1]!));
        yield* eventually(() => expect(texts(resumed.got)).toEqual(['c', 'd']));
      }),
    ));

  it('goes live after catching up, with no gap and nothing twice', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        // More than a page, so catching up takes several reads.
        for (let i = 0; i < 450; i++) yield* store.appendRaw(text(`old-${i}`));
        const { got } = yield* collect(messages('s1', null));
        // Writes race the catch-up, then keep coming once it is live.
        for (let i = 0; i < 200; i++) {
          yield* store.appendRaw(text(`new-${i}`));
          if (i % 20 === 0) yield* Effect.yieldNow;
        }
        yield* eventually(() => expect(got).toHaveLength(650));
        const all = texts(got);
        expect(new Set(all).size).toBe(650);
        expect(all.slice(0, 450)).toEqual(
          Array.from({ length: 450 }, (_, i) => `old-${i}`),
        );
        expect(all.slice(450)).toEqual(
          Array.from({ length: 200 }, (_, i) => `new-${i}`),
        );
        const us = got.map((wire) => wire.meta._u);
        expect([...us].sort()).toEqual(us);
      }),
    ));

  it('only follows its own session', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        const { got } = yield* collect(messages('s1', null));
        yield* store.appendRaw({ ...text('elsewhere'), sessionId: 's2' });
        yield* store.appendRaw(text('here'));
        yield* eventually(() => expect(texts(got)).toEqual(['here']));
      }),
    ));
});

describe('the projects feed', () => {
  it('replays, then sends each change, tombstones too', () =>
    run(
      Effect.gen(function* () {
        const store = yield* Store;
        const project = { id: 'p1', path: '/tmp/x', name: 'x', createdAt: 1 };
        yield* store.saveProject(project);
        const { got } = yield* collect(projects(null));
        yield* eventually(() => expect(got).toHaveLength(1));
        yield* store.removeProject('p1');
        yield* eventually(() => expect(got).toHaveLength(2));
        expect(got[0]).toMatchObject({ value: project, meta: { _v: 'v1' } });
        expect(got[1]?.meta._d).toBe(true);
      }),
    ));
});
