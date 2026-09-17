import { Effect } from 'effect';
import { generateSecretKey, verifyEvent } from 'nostr-tools/pure';
import { describe, expect, it } from 'vitest';
import { startConnectionAttempt } from '../src/flow-tracing/index.js';
import { NegotiationMessage } from '../src/negotiation/index.js';
import { PeerId } from '../src/peer-identity/index.js';
import { kind, makeEvent, readEvent } from '../src/signaling/nostr/event.js';

describe('Nostr signaling events', () => {
  it('signs and decodes one addressed negotiation envelope', async () => {
    const alice = PeerId.make('alice');
    const bob = PeerId.make('bob');
    const envelope = await Effect.runPromise(
      Effect.gen(function* () {
        const attempt = yield* startConnectionAttempt({
          localPeerId: alice,
          remotePeerId: bob,
        });
        return yield* attempt.send(
          NegotiationMessage.make({ _tag: 'Offer', description: 'offer' }),
        );
      }).pipe(Effect.scoped),
    );
    const event = makeEvent({
      namespace: 'test',
      sender: alice,
      recipient: bob,
      envelope,
      secretKey: generateSecretKey(),
      maxAgeSeconds: 30,
    });

    expect(event.kind).toBe(kind);
    expect(event.tags).toContainEqual(['d', 'test']);
    expect(event.tags).toContainEqual(['t', bob]);
    expect(verifyEvent(event)).toBe(true);
    expect(readEvent(event, event.created_at, 30)).toEqual({
      version: 1,
      sender: alice,
      envelope,
    });
    expect(() => readEvent(event, event.created_at + 31, 30)).toThrow('stale');
  });
});
