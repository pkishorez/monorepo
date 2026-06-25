import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { DevtoolsRpc } from '@monorepo/devtools/rpc';
import { DevtoolsClient, type DevtoolsRuntime } from './runtime';

/** The resolved RPC client object carrying the DevTools procedures. */
type Client = Effect.Success<typeof DevtoolsClient>;

type DevtoolsRpcs = RpcGroup.Rpcs<typeof DevtoolsRpc>;

type RpcSuccess<Tag extends string> = Rpc.Success<
  Rpc.ExtractTag<DevtoolsRpcs, Tag>
>;

/** The `RunDepcruise` success payload (discriminated availability union). */
export type RunDepcruiseResult = RpcSuccess<'RunDepcruise'>;

/**
 * Bridge an Effect that needs {@link DevtoolsClient} into a Promise the
 * react-query `queryFn` can await. Rejects on Effect failure so react-query
 * surfaces the error.
 */
const runProcedure = <A>(
  runtime: DevtoolsRuntime,
  call: (client: Client) => Effect.Effect<A, unknown, never>,
): Promise<A> =>
  runtime.runPromise(
    Effect.gen(function* () {
      const client = yield* DevtoolsClient;
      return yield* call(client);
    }),
  );

/** Dependency-cruiser graph for `path`. Disabled when `path` is empty. */
export function useDepcruise(runtime: DevtoolsRuntime, path: string) {
  return useQuery({
    queryKey: ['depcruise', runtime, path] as const,
    queryFn: () => runProcedure(runtime, (c) => c.RunDepcruise({ path })),
    enabled: !!path,
  });
}
