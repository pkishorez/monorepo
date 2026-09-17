import { Effect, Fiber, Option, Stream } from 'effect';
import { generateSecretKey } from 'nostr-tools/pure';
import { describe, expect, it, vi } from 'vitest';
import { startConnectionAttempt } from '../src/flow-tracing/index.js';
import { NegotiationMessage } from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';
import { Signaling } from '../src/signaling/signaling.js';
import { makeEvent } from '../src/signaling/nostr/event.js';

const relay = vi.hoisted(() => ({
  instance: undefined as
    | {
        handlers?: {
          onevent: (event: ReturnType<typeof makeEvent>) => void;
          onclose?: (reasons: ReadonlyArray<unknown>) => void;
        };
        published?: ReadonlyArray<string>;
        subscriptions: number;
      }
    | undefined,
}));

vi.mock('nostr-tools/pool', () => ({
  SimplePool: class {
    readonly statuses = new Map<string, boolean>();
    subscriptions = 0;

    constructor() {
      relay.instance = this;
    }

    ensureRelay(url: string) {
      this.statuses.set(url, true);
      return Promise.resolve({});
    }

    listConnectionStatus() {
      return this.statuses;
    }

    subscribeMany(
      _urls: ReadonlyArray<string>,
      _filter: unknown,
      handlers: {
        onevent: (event: ReturnType<typeof makeEvent>) => void;
        onclose?: (reasons: ReadonlyArray<unknown>) => void;
      },
    ) {
      this.subscriptions += 1;
      relay.instance!.handlers = handlers;
      return { close: () => undefined };
    }

    publish(urls: ReadonlyArray<string>) {
      relay.instance!.published = urls;
      return urls.map(() => Promise.resolve('ok'));
    }

    destroy() {}
  },
}));

describe('Nostr signaling provider', () => {
  it('uses a controlled relay pool for addressed send and receive', async () => {
    const { layer } = await import('../src/signaling/nostr/nostr.js');
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const signaling = yield* Signaling;
          const bob = PeerId.make('bob');
          const connection = yield* signaling.open(bob);
          const received = yield* Stream.runHead(connection.incoming).pipe(
            Effect.forkScoped({ startImmediately: true }),
          );
          const attempt = yield* startConnectionAttempt({
            localPeerId: PeerId.make('alice'),
            remotePeerId: bob,
          });
          const envelope = yield* attempt.send(
            NegotiationMessage.make({
              _tag: 'Offer',
              description: 'offer',
            }),
          );
          relay.instance!.handlers!.onevent(
            makeEvent({
              namespace: 'test',
              sender: PeerId.make('alice'),
              recipient: bob,
              envelope,
              secretKey: generateSecretKey(),
              maxAgeSeconds: 30,
            }),
          );
          yield* connection.send(PeerId.make('alice'), envelope);
          return Option.getOrThrow(yield* Fiber.join(received));
        }).pipe(
          Effect.provide(
            layer({
              relays: ['wss://one.example', 'wss://two.example'],
              namespace: 'test',
            }),
          ),
        ),
      ),
    );

    expect(result.sender).toBe(PeerId.make('alice'));
    expect(relay.instance?.published).toHaveLength(2);
  });

  it('resubscribes after every relay closes during an outage', async () => {
    const { layer } = await import('../src/signaling/nostr/nostr.js');
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const signaling = yield* Signaling;
          yield* signaling.open(PeerId.make('bob'));
          expect(relay.instance?.subscriptions).toBe(1);
          relay.instance!.handlers!.onclose!([]);
          yield* Effect.yieldNow;
          expect(relay.instance?.subscriptions).toBe(2);
        }).pipe(
          Effect.provide(
            layer({
              relays: ['wss://one.example', 'wss://two.example'],
              namespace: 'test',
            }),
          ),
        ),
      ),
    );
  });
});
