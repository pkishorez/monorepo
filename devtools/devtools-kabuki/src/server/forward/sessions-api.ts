import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import type { RpcClient, RpcClientError } from 'effect/rpc';

/*
 * What DevTools answers its own page and CLI about Kabuki Sessions: which
 * are live, over one socket, and one Kabuki Session's Api, over a socket
 * of its own. Both show them grouped alike: by app, then Environment.
 */

/** A live Kabuki Session, as listed. */
export const KabukiSessionSummary = Schema.Struct({
  name: Schema.String,
  app: Schema.String,
  /** Where it runs: the page's host, or the one the app gave. */
  environment: Schema.String,
  url: Schema.String,
  /** The page's origin; `null` when its socket said none, as outside a browser. */
  origin: Schema.NullOr(Schema.String),
  /** When it connected, in milliseconds. */
  connectedAt: Schema.Number,
});
export type KabukiSessionSummary = typeof KabukiSessionSummary.Type;

/** No live Kabuki Session has the name; `available` lists those that are. */
export class KabukiSessionNotFound extends Schema.TaggedError<KabukiSessionNotFound>()(
  'KabukiSessionNotFound',
  { name: Schema.String, available: Schema.Array(Schema.String) },
) {}

export const KabukiSessionsApi = RpcGroup.make(
  /** The live Kabuki Sessions, oldest first. */
  Rpc.make('list', { success: Schema.Array(KabukiSessionSummary) }),
  /** The live Kabuki Sessions now, then again after every change. */
  Rpc.make('watch', {
    success: Schema.Array(KabukiSessionSummary),
    stream: true,
  }),
);

export type KabukiSessionsClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof KabukiSessionsApi>,
  RpcClientError.RpcClientError
>;

/** Where on the DevTools Server the live Kabuki Sessions are listed. */
export const SESSIONS_PATH = '/kabuki/sessions';

/** Where on the DevTools Server one Kabuki Session's Api is answered. */
export const sessionPath = (name: string) =>
  `/kabuki/session/${encodeURIComponent(name)}`;

/** The Kabuki Sessions of one app in one Environment, in the order given. */
export interface EnvironmentGroup<S> {
  readonly environment: string;
  readonly sessions: ReadonlyArray<S>;
}

/** The Kabuki Sessions of one app, by Environment. */
export interface AppGroup<S> {
  readonly app: string;
  readonly environments: ReadonlyArray<EnvironmentGroup<S>>;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether an Environment is a host on this computer: `localhost:5173`, `code.kishore.localhost`. */
export const isLocalEnvironment = (environment: string) => {
  const host = environment.replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
};

const byName = (a: string, b: string) => a.localeCompare(b);

const byEnvironment = (a: string, b: string) =>
  Number(isLocalEnvironment(b)) - Number(isLocalEnvironment(a)) || byName(a, b);

/** Kabuki Sessions grouped by app, A to Z, then Environment, this computer's first; each group keeps their order. */
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
