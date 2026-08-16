import { Effect } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { AnyESchema } from '../../../eschema/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import type { EffectRunner } from '../effect-runner/index.js';
import { defaultPeerChannelFactory } from './broadcast-channel.js';
import { makePeerMessageCodec } from './peer-message.js';

type PeerOperation<A> = Promise<A> | Effect.Effect<A, unknown>;

export interface PeerChannel {
  broadcast(message: unknown): PeerOperation<void>;
  subscribe(
    handler: (message: unknown) => void,
  ): PeerOperation<() => Promise<void>>;
}

export type PeerChannelFactory = (
  name: string,
) => PeerChannel | PeerOperation<PeerChannel>;

type PropagationDisabled = { readonly propagate: false };

const runOperation = <A, R>(
  operation: PeerOperation<A>,
  runner: EffectRunner<R>,
): Promise<A> =>
  Effect.isEffect(operation)
    ? runner.runPromise(operation as Effect.Effect<A, unknown, R>)
    : operation;

export const makePeerSync = <TItem, R = never>(args: {
  collectionName: string;
  schema: AnyESchema;
  runner: EffectRunner<R>;
  report: SyncReporter<R>;
  apply: (
    entities: EntityType<TItem>[],
    options: PropagationDisabled,
  ) => Effect.Effect<void, unknown, R>;
  channel?: PeerChannelFactory | null;
}) => {
  const codec = makePeerMessageCodec<TItem>(args.schema);
  let accepting = true;
  let admitted = Promise.resolve();
  let unsubscribe: (() => Promise<void>) | null = null;

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
        args.apply([...decoded.entities] as EntityType<TItem>[], {
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

  const factory =
    args.channel === undefined ? defaultPeerChannelFactory() : args.channel;
  const ready: Promise<PeerChannel | null> = (async () => {
    if (factory === null) return null;
    let channel: PeerChannel;
    try {
      const created = factory(args.collectionName);
      channel = Effect.isEffect(created)
        ? await args.runner.runPromise(
            created as Effect.Effect<PeerChannel, unknown, R>,
          )
        : await created;
    } catch (cause) {
      await report('channel-creation', cause);
      return null;
    }

    try {
      unsubscribe = await runOperation(channel.subscribe(admit), args.runner);
    } catch (cause) {
      await report('subscription', cause);
      return null;
    }
    return channel;
  })();

  return {
    broadcast: async (
      entities: readonly [EntityType<TItem>, ...EntityType<TItem>[]],
    ): Promise<void> => {
      if (!accepting) return;
      let message: unknown;
      try {
        message = await args.runner.runPromise(codec.encode(entities));
        const channel = await ready;
        if (channel !== null && accepting) {
          await runOperation(channel.broadcast(message), args.runner);
        }
      } catch (cause) {
        await report('send', cause);
      }
    },
    close: async (): Promise<void> => {
      if (!accepting) return admitted;
      accepting = false;
      await ready;
      if (unsubscribe !== null) {
        try {
          await unsubscribe();
        } catch (cause) {
          await report('cleanup', cause);
        }
      }
      await admitted;
    },
  };
};
