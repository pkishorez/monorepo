import { Effect } from 'effect';
import type { DecodedEntity } from '../../../core/index.js';
import type { AnyESchema } from '../../../eschema/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import type { EffectRunner } from '../effect-runner/index.js';
import { makePeerMessageCodec } from './peer-message.js';

import type {
  PeerChannel,
  PeerChannelFactory,
} from '../../domain/peer-channel/index.js';
import { openPeerChannel } from './open-channel.js';

export type { PeerChannel, PeerChannelFactory };

type PropagationDisabled = { readonly propagate: false };

export const makePeerSync = <TItem, R = never>(args: {
  collectionName: string;
  schema: AnyESchema & { readonly Type: TItem };
  runner: EffectRunner<R>;
  report: SyncReporter<R>;
  apply: (
    entities: DecodedEntity<TItem>[],
    options: PropagationDisabled,
  ) => Effect.Effect<void, unknown, R>;
  channel?: PeerChannelFactory | null;
}) => {
  const codec = makePeerMessageCodec(args.schema);
  let accepting = true;
  let admitted = Promise.resolve();

  const report = async (
    phase:
      | 'send'
      | 'channel-creation'
      | 'cleanup'
      | 'decode'
      | 'receive'
      | 'subscription',
    cause: unknown,
  ): Promise<void> => {
    try {
      await args.runner.runPromise(
        args.report({
          _tag: 'PeerSyncFailed',
          collection: args.collectionName,
          phase,
          cause,
        }),
      );
    } catch {
      // Reporting must not turn best-effort transport failures into sync failures.
    }
  };

  const applyMessage = async (message: unknown): Promise<void> => {
    let decoded;
    try {
      decoded = await args.runner.runPromise(codec.decode(message));
    } catch (cause) {
      await report('decode', cause);
      return;
    }
    try {
      await args.runner.runPromise(
        args.apply([...decoded.entities] as DecodedEntity<TItem>[], {
          propagate: false,
        }),
      );
    } catch (cause) {
      await report('receive', cause);
    }
  };

  const admit = (message: unknown): void => {
    if (!accepting) return;
    admitted = admitted.then(() => applyMessage(message));
  };

  const channel = openPeerChannel({
    name: args.collectionName,
    factory: args.channel ?? null,
    runner: args.runner,
    onMessage: admit,
    onError: report,
  });

  return {
    broadcast: async (
      entities: readonly [DecodedEntity<TItem>, ...DecodedEntity<TItem>[]],
    ): Promise<void> => {
      if (!accepting) return;
      let message: unknown;
      try {
        message = await args.runner.runPromise(
          codec.encode(entities as Parameters<typeof codec.encode>[0]),
        );
      } catch (cause) {
        await report('send', cause);
        return;
      }
      await channel.broadcast(message);
    },
    close: async (): Promise<void> => {
      if (!accepting) return admitted;
      accepting = false;
      await channel.close();
      await admitted;
    },
  };
};
