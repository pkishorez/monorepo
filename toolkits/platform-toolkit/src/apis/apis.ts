import { Effect, Layer } from 'effect';
import type {
  Rpc as EffectRpc,
  RpcClient,
  RpcClientError,
  RpcGroup,
} from 'effect/rpc';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

/** How an API is reached on the cloud Backend. On the device Backend every
 * API is called in this process, whatever its Transport. */
export type Transport = 'http' | 'websocket';

/** One of an app's APIs: a group and the Transport it is reached by. */
export interface Api<Rpcs extends EffectRpc.Any = EffectRpc.Any> {
  readonly group: RpcGroup.RpcGroup<Rpcs>;
  readonly transport: Transport;
  /** A path, resolved against the cloud address the Platform knows, or a
   * full URL, left alone. */
  readonly path: string;
}

const api =
  (transport: Transport) =>
  <Rpcs extends EffectRpc.Any>(
    group: RpcGroup.RpcGroup<Rpcs>,
    options: { readonly path: string },
  ): Api<Rpcs> => ({ group, transport, path: options.path });

/**
 * Declares an app's APIs, each by the Transport it is reached by:
 * `Api.http(LedgerApi, { path: '/rpc' })` (POST, NDJSON, batched) or
 * `Api.websocket(ChatApi, { path: '/rpc/chat' })`. Name them in one object;
 * the names are how the Session and screens reach each one.
 */
export const Api = { http: api('http'), websocket: api('websocket') };

/** An app's APIs, by the names it gives them. A group is invariant in its
 * calls, so any group's Api fits only as `Api<any>`. */
// oxlint-disable-next-line no-explicit-any
export type Apis = Readonly<Record<string, Api<any>>>;

/** The calls of one API. */
export type RpcsOf<A> = A extends Api<infer Rpcs> ? Rpcs : never;

/** An API's client: one Effect per call. */
export type ApiClient<Rpcs extends EffectRpc.Any> = RpcClient.RpcClient<
  Rpcs,
  RpcClientError.RpcClientError
>;

/** Every API's client, by name. */
export type ApiClients<A extends Apis> = {
  readonly [K in keyof A]: ApiClient<RpcsOf<A[K]>>;
};

/** One API's handlers, with everything they stand on, run on the device. */
export type DeviceBackend<Rpcs extends EffectRpc.Any> = Layer.Layer<
  EffectRpc.ToHandler<Rpcs> | EffectRpc.Middleware<Rpcs>,
  unknown
>;

/** The device Backend: every API's handlers, by the same names. An app
 * with a device Backend has one for every API, or the device Backend would
 * be half real. */
export type DeviceBackends<A extends Apis> = {
  readonly [K in keyof A]: DeviceBackend<RpcsOf<A[K]>>;
};

/** `path` against `base`; a full URL stays as it is. */
export const resolve = (path: string, base: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(path)
    ? path
    : `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

// `url` with the token `token` gives as its `access_token`.
const signedUrl = (url: string, token: Effect.Effect<string>) =>
  Effect.map(token, (current) => {
    const signed = new URL(url);
    signed.searchParams.set('access_token', current);
    return signed.href;
  });

/** How a call reaches one API on the cloud Backend. A call carries its
 * Account's token and never a cookie, which names whoever is active in the
 * browser. A WebSocket also opens with the token `token` gives at each
 * connect, in its address, as a browser sets no headers on one: that is how
 * the cloud knows whose it is before any call. */
export const cloudProtocol = (
  { group, transport, path }: Apis[string],
  base: string,
  token: Effect.Effect<string> | null = null,
): Layer.Layer<RpcClient.Protocol> => {
  const url = resolve(path, base);
  return transport === 'http'
    ? Rpc.http.client(group, { url, credentials: 'omit' })
    : (Rpc.websocket.client(group, {
        url: token === null ? url : signedUrl(url, token),
      }) as Layer.Layer<RpcClient.Protocol, never, never>);
};

/** How a call reaches one API's handlers in this process. */
export const deviceProtocol = (
  { group }: Apis[string],
  handlers: DeviceBackend<EffectRpc.Any>,
): Layer.Layer<RpcClient.Protocol> =>
  Rpc.inProcess
    .client(group, handlers as never)
    .pipe(Layer.orDie) as Layer.Layer<RpcClient.Protocol>;
