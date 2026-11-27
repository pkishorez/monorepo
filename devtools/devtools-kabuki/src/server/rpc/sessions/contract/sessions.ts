import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { Rpc, RpcClient, RpcGroup } from 'effect/rpc';
import type { RpcClientError } from 'effect/rpc';
import { SESSIONS_PATH, protocolTo } from '../../contract/index.ts';

export const KabukiSessionSummary = Schema.Struct({
  name: Schema.String,
  app: Schema.String,
  environment: Schema.String,
  url: Schema.String,
  origin: Schema.NullOr(Schema.String),
  connectedAt: Schema.Number,
});
export type KabukiSessionSummary = typeof KabukiSessionSummary.Type;

export class KabukiSessionNotFound extends Schema.TaggedError<KabukiSessionNotFound>()(
  'KabukiSessionNotFound',
  { name: Schema.String, available: Schema.Array(Schema.String) },
) {}

export const KabukiSessionsRpcs = RpcGroup.make(
  Rpc.make('list', { success: Schema.Array(KabukiSessionSummary) }),
  Rpc.make('watch', {
    success: Schema.Array(KabukiSessionSummary),
    stream: true,
  }),
);

export type KabukiSessionsClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof KabukiSessionsRpcs>,
  RpcClientError.RpcClientError
>;

export const dialSessions = (
  origin: string,
): Effect.Effect<KabukiSessionsClient, never, Scope.Scope> =>
  Effect.flatMap(protocolTo(origin, SESSIONS_PATH), (protocol) =>
    RpcClient.make(KabukiSessionsRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    ),
  );

export interface EnvironmentGroup<S> {
  readonly environment: string;
  readonly sessions: ReadonlyArray<S>;
}

export interface AppGroup<S> {
  readonly app: string;
  readonly environments: ReadonlyArray<EnvironmentGroup<S>>;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const isLocalEnvironment = (environment: string) => {
  const host = environment.replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
};

const byName = (a: string, b: string) => a.localeCompare(b);

const byEnvironment = (a: string, b: string) =>
  Number(isLocalEnvironment(b)) - Number(isLocalEnvironment(a)) || byName(a, b);

export const grouped = <
  S extends { readonly app: string; readonly environment: string },
>(
  sessions: ReadonlyArray<S>,
): ReadonlyArray<AppGroup<S>> => {
  const apps = new Map<string, Map<string, Array<S>>>();
  for (const session of sessions) {
    const environments = apps.get(session.app) ?? new Map();
    apps.set(session.app, environments);
    const list = environments.get(session.environment) ?? [];
    environments.set(session.environment, list);
    list.push(session);
  }
  return [...apps.keys()].sort(byName).map((app) => {
    const environments = apps.get(app)!;
    return {
      app,
      environments: [...environments.keys()]
        .sort(byEnvironment)
        .map((environment) => ({
          environment,
          sessions: environments.get(environment)!,
        })),
    };
  });
};
