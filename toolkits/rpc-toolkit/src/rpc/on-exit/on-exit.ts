import { Context, Effect, type Exit, Layer, Schema } from 'effect';
import { Rpc, RpcClient, type RpcGroup } from 'effect/rpc';

/** Told how a call ended: its decoded Exit, as the caller is about to see it. */
export type ExitObserver = (
  exit: Exit.Exit<unknown, unknown>,
) => Effect.Effect<void>;

const Observers = Context.Reference<ReadonlyArray<ExitObserver>>(
  '@kestack/rpc-toolkit/rpc/ExitObservers',
  { defaultValue: () => [] },
);

/**
 * Runs `observer` with the Exit of each call sent from within `send`, before
 * the caller sees it. A Client Implementation's `next` only sends, so this is
 * how it reacts to the answer: `next(request).pipe(Rpc.onExit(...))`.
 *
 * Works over every Transport's client. Over websocket the connection's other
 * answers wait for `observer`, so keep it short.
 */
export const onExit =
  (observer: ExitObserver) =>
  <A, E, R>(send: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.updateService(send, Observers, (observers) => [
      ...observers,
      observer,
    ]);

interface Pending {
  readonly clientId: number;
  readonly tag: string;
  readonly observers: ReadonlyArray<ExitObserver>;
}

const observing =
  (group: RpcGroup.Any) =>
  (protocol: RpcClient.Protocol['Service']): RpcClient.Protocol['Service'] => {
    const pending = new Map<string, Pending>();
    const rpcs = (group as RpcGroup.RpcGroup<Rpc.Any>).requests;

    const observe = ({ tag, observers }: Pending, encoded: unknown) => {
      const rpc = rpcs.get(tag);
      if (rpc === undefined) return Effect.void;
      return Schema.decodeUnknownEffect(protocol.codecFor(Rpc.exitSchema(rpc)))(
        encoded,
      ).pipe(
        Effect.flatMap((exit) =>
          Effect.forEach(observers, (observer) => observer(exit), {
            discard: true,
          }),
        ),
        Effect.catchCause(Effect.logError),
      ) as Effect.Effect<void>;
    };

    const forget = (clientId: number) => {
      for (const [id, entry] of pending) {
        if (entry.clientId === clientId) pending.delete(id);
      }
    };

    return {
      ...protocol,
      send: (clientId, message, transferables) => {
        if (message._tag === 'Request') {
          return Effect.withFiber((fiber) => {
            const observers = fiber.getRef(Observers);
            if (observers.length > 0) {
              pending.set(String(message.id), {
                clientId,
                tag: message.tag,
                observers,
              });
            }
            return protocol.send(clientId, message, transferables);
          });
        }
        if (message._tag === 'Interrupt') {
          pending.delete(String(message.requestId));
        }
        return protocol.send(clientId, message, transferables);
      },
      run: (clientId, f) =>
        protocol.run(clientId, (message) => {
          switch (message._tag) {
            case 'Exit': {
              const id = String(message.requestId);
              const entry = pending.get(id);
              if (entry === undefined) return f(message);
              pending.delete(id);
              return Effect.andThen(observe(entry, message.exit), f(message));
            }
            case 'Defect':
            case 'ClientProtocolError':
              forget(clientId);
              return f(message);
            default:
              return f(message);
          }
        }),
    };
  };

/** Wraps a Transport's client so that `onExit` observers hear each answer.
 * Keeps every other service `layer` provides. */
export const withExitObservers =
  (group: RpcGroup.Any) =>
  <ROut, E, R>(
    layer: Layer.Layer<ROut | RpcClient.Protocol, E, R>,
  ): Layer.Layer<ROut | RpcClient.Protocol, E, R> =>
    Layer.effect(
      RpcClient.Protocol,
      Effect.map(RpcClient.Protocol, observing(group)),
    ).pipe(Layer.provideMerge(layer));
