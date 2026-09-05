import { Schema } from 'effect';
import type { PeerChannelFactory } from '../../domain/peer-channel/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import { openPeerChannel } from '../../platform/peer-sync/index.js';
import type { OutboxOutcome } from '../entries/index.js';

const doorbellMessage = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  outcome: Schema.Literals(['enqueued', 'delivered', 'failed']),
});

const isMessage = Schema.is(doorbellMessage);

export type DoorbellMessage = typeof doorbellMessage.Type;

// Best-effort same-origin doorbell: any tab announces an Entry to the leader,
// the Drainer announces an outcome back. The Outbox store stays the truth.
export const makeDoorbell = <R>(args: {
  syncName: string;
  factory: PeerChannelFactory | null;
  runner: EffectRunner<R>;
  onMessage: (message: DoorbellMessage) => void;
}) => {
  const channel = openPeerChannel({
    name: `${args.syncName}.outbox`,
    factory: args.factory,
    runner: args.runner,
    onMessage: (raw) => {
      if (isMessage(raw)) args.onMessage(raw);
    },
    onError: async () => undefined,
  });
  return {
    ring: (id: string, outcome: 'enqueued' | OutboxOutcome) =>
      channel.broadcast({ version: 1, id, outcome }),
    close: channel.close,
  };
};
