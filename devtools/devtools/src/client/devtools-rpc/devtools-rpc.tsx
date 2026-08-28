import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from 'effect/unstable/http';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import { DevtoolsRpc } from '../../rpc/index.js';

type Client = Effect.Success<ReturnType<typeof makeClientEffect>>;

const makeClientEffect = () => RpcClient.make(DevtoolsRpc);

export class DevtoolsClient extends Context.Service<DevtoolsClient, Client>()(
  'devtools/DevtoolsClient',
) {}

const makeProtocolLayer = () =>
  RpcClient.layerProtocolHttp({
    url: globalThis.location.origin,
    transformClient: HttpClient.mapRequest(HttpClientRequest.appendUrl('/rpc')),
  }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );

export const makeDevtoolsClientLayer = () =>
  Layer.effect(DevtoolsClient, makeClientEffect()).pipe(
    Layer.provide(makeProtocolLayer()),
  );

export type DevtoolsRuntime = ManagedRuntime.ManagedRuntime<
  DevtoolsClient,
  never
>;

const RuntimeContext = createContext<DevtoolsRuntime | null>(null);

export function DevtoolsRpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [runtime] = useState(() =>
    ManagedRuntime.make(makeDevtoolsClientLayer()),
  );
  const disposeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disposeTimer.current !== null) {
      clearTimeout(disposeTimer.current);
      disposeTimer.current = null;
    }

    return () => {
      // Strict Mode immediately re-runs this effect in development. Defer
      // disposal for one task so that rehearsal cleanup can be cancelled,
      // while a real unmount still releases the runtime.
      disposeTimer.current = setTimeout(() => {
        disposeTimer.current = null;
        void runtime.dispose();
      }, 0);
    };
  }, [runtime]);

  return (
    <RuntimeContext.Provider value={runtime}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </RuntimeContext.Provider>
  );
}

export function useDevtoolsRuntime(): DevtoolsRuntime {
  const runtime = useContext(RuntimeContext);
  if (runtime === null) {
    throw new Error('DevtoolsRpcProvider is missing.');
  }
  return runtime;
}
