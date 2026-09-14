import { Schema } from 'effect';
import type { Event, VerifiedEvent } from 'nostr-tools/core';
import { finalizeEvent } from 'nostr-tools/pure';
import { NegotiationEnvelope } from '../../negotiation/index.js';
import { PeerId } from '../../peer-identity/index.js';

export const kind = 25050;
export const maxContentBytes = 64 * 1024;

const Content = Schema.Struct({
  version: Schema.Literal(1),
  sender: PeerId,
  envelope: NegotiationEnvelope,
});

const encode = Schema.encodeSync(Schema.fromJsonString(Content));
const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Content));

export const makeEvent = (options: {
  readonly namespace: string;
  readonly sender: typeof PeerId.Type;
  readonly recipient: typeof PeerId.Type;
  readonly envelope: typeof NegotiationEnvelope.Type;
  readonly secretKey: Uint8Array;
  readonly maxAgeSeconds: number;
}): VerifiedEvent => {
  const now = Math.floor(Date.now() / 1000);
  return finalizeEvent(
    {
      kind,
      created_at: now,
      tags: [
        ['d', options.namespace],
        ['t', options.recipient],
        ['expiration', String(now + options.maxAgeSeconds)],
      ],
      content: encode({
        version: 1,
        sender: options.sender,
        envelope: options.envelope,
      }),
    },
    options.secretKey,
  );
};

export const readEvent = (
  event: Event,
  nowSeconds: number,
  maxAgeSeconds: number,
) => {
  if (new TextEncoder().encode(event.content).byteLength > maxContentBytes) {
    throw new Error('Nostr signaling event content exceeds 64 KiB');
  }
  if (event.created_at < nowSeconds - maxAgeSeconds) {
    throw new Error('Nostr signaling event is stale');
  }
  const expiration = event.tags.find(([name]) => name === 'expiration')?.[1];
  if (
    expiration === undefined ||
    !/^\d+$/.test(expiration) ||
    Number(expiration) <= nowSeconds
  ) {
    throw new Error('Nostr signaling event is expired');
  }
  return decode(event.content);
};
