import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import type { RpcClient, RpcClientError } from 'effect/rpc';

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
