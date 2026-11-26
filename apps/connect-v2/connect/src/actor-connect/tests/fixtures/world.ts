import { Deferred, Effect, Layer, Option, Stream } from 'effect';
import { vi } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import type { Report } from '@kestack/connect-v2-cloud/heartbeat';
import {
  Cloud,
  type ReportAnswer,
} from '../../../services/cloud/contract/index.js';
import {
  Cloudflared,
  TunnelFailed,
} from '../../../services/cloudflared/contract/index.js';
import {
  type Answers,
  Control,
} from '../../../services/control/contract/index.js';
import {
  type Exit,
  Plugins,
  PluginStartFailed,
} from '../../../services/plugins/contract/index.js';
import {
  PortFailed,
  Server,
  type ServerOptions,
} from '../../../services/server/contract/index.js';
import {
  SignIn,
  SignInFailed,
  type User,
} from '../../../services/sign-in/contract/index.js';
import { Store } from '../../../services/store/contract/index.js';
import { Connect, type Input, type Settings } from '../../index.js';

export const ADA: User = { id: 'ada', email: 'ada@kestack.test' };

export const hash = (letter: string) => letter.repeat(64);

export const release = (letter: string) => ({
  hash: hash(letter),
  url: `https://releases.test/${letter}.mjs`,
});

export interface WorldOptions {
  readonly saved?: User | null;
  readonly signIn?: Effect.Effect<User, SignInFailed>;
  readonly signInAgain?: Effect.Effect<User, SignInFailed>;
  readonly answer?: (count: number, report: Report) => ReportAnswer;
  readonly portFails?: boolean;
  readonly openFails?: number;
  readonly startFails?: (name: string) => boolean;
}

export const world = (options: WorldOptions = {}) => {
  const events: Array<string> = [];
  const reports: Array<Report> = [];
  const running = new Map<string, Deferred.Deferred<Exit>>();
  let server: ServerOptions | null = null;
  let answers: Answers | null = null;
  let opens = 0;
  const state = {
    answer:
      options.answer ??
      (() => ({ _tag: 'Enabled', plugins: {} }) as ReportAnswer),
    reachable: true,
    startFails: options.startFails ?? (() => false),
  };

  const signIn = SignIn.of({
    saved: Effect.sync(() => {
      events.push('saved');
      return options.saved ?? null;
    }),
    signIn: Effect.suspend(() => {
      events.push('signIn');
      return options.signIn ?? Effect.succeed(ADA);
    }),
    signInAgain: Effect.suspend(() => {
      events.push('signInAgain');
      return options.signInAgain ?? Effect.succeed(ADA);
    }),
    signOut: Effect.sync(() => void events.push('signOut')),
    signing: Layer.empty as Layer.Layer<unknown>,
  });

  const store = Store.of({
    connection: Effect.succeed(null),
    claim: ({ name }) => Effect.succeed({ id: 'connection-1', name }),
    forget: Effect.void,
    authWorker: () => Effect.succeed(null),
    keepAuthWorker: () => Effect.void,
    signInTable: Layer.empty as never,
  });

  const cloud = Cloud.of({
    report: (report) =>
      Effect.sync(() => {
        reports.push(report);
        return state.answer(reports.length, report);
      }),
    remove: () => Effect.void,
  });

  const control = Control.of({
    answer: (given) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          answers = given;
        }),
        () =>
          Effect.sync(() => {
            answers = null;
          }),
      ),
  });

  const listening = Server.of({
    listen: (given) =>
      options.portFails
        ? Effect.fail(new PortFailed({ message: 'port 1 is taken' }))
        : Effect.acquireRelease(
            Effect.sync(() => {
              server = given;
              events.push('listen');
              return 4242;
            }),
            () => Effect.sync(() => void events.push('unlisten')),
          ),
  });

  const cloudflared = Cloudflared.of({
    open: () =>
      Effect.suspend(() => {
        opens++;
        if (opens <= (options.openFails ?? 0))
          return Effect.fail(new TunnelFailed({ message: 'no network' }));
        const url = `https://t${opens}.trycloudflare.com`;
        return Effect.acquireRelease(
          Effect.sync(() => {
            events.push(`open ${url}`);
            return { url, closed: Effect.never };
          }),
          () => Effect.sync(() => void events.push(`close ${url}`)),
        );
      }),
    reachable: () => Effect.sync(() => state.reachable),
  });

  const plugins = Plugins.of({
    start: (run) =>
      Effect.gen(function* () {
        const key = `${run.name}@${run.release.hash.slice(0, 1)}`;
        events.push(`start ${key}`);
        if (state.startFails(run.name))
          return yield* new PluginStartFailed({
            message: `${run.name} would not start`,
            log: ['boom'],
          });
        const exited = yield* Deferred.make<Exit>();
        running.set(key, exited);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            running.delete(key);
            events.push(`stop ${key}`);
          }),
        );
        return { exited: Deferred.await(exited) };
      }),
  });

  const layer = Layer.mergeAll(
    Layer.succeed(SignIn, signIn),
    Layer.succeed(Store, store),
    Layer.succeed(Cloud, cloud),
    Layer.succeed(Control, control),
    Layer.succeed(Server, listening),
    Layer.succeed(Cloudflared, cloudflared),
    Layer.succeed(Plugins, plugins),
  );

  return {
    layer,
    events,
    reports,
    state,
    running: () => [...running.keys()].sort(),
    server: () => server,
    answers: () => answers,
    crash: (key: string, code = 1) =>
      Effect.suspend(() => {
        const exited = running.get(key);
        return exited === undefined
          ? Effect.die(new Error(`${key} is not running`))
          : Deferred.succeed(exited, { code, log: ['crashed'] });
      }),
  };
};

export type World = ReturnType<typeof world>;

type SettingsGiven = Partial<Omit<Settings, 'tunnel'>> & {
  readonly tunnel?: Partial<Settings['tunnel']>;
};

export const inputOf = (settings: SettingsGiven = {}): Input => ({
  connection: {
    name: 'main',
    computerName: 'Ada-MacBook',
    cloud: 'https://connect.test',
    version: '1.0.0',
  },
  settings: {
    heartbeatEvery: 20,
    firstRetryAfter: 10,
    ...settings,
    tunnel: {
      port: 0,
      origins: [],
      reachEvery: 20,
      rotateKeyEvery: 60 * 60 * 1000,
      ...settings.tunnel,
    },
    pluginHome: {
      data: '/data/plugins',
      state: '/state/plugins',
      cache: '/cache/plugins',
      sockets: { prefix: '/run/k/', suffix: '.sock' },
    },
  },
});

export const start = (host: World, settings: SettingsGiven = {}) =>
  Effect.gen(function* () {
    const running = yield* Runtime.scoped(Connect, {
      input: inputOf(settings),
      layer: host.layer,
    });
    const now = () => running.root;
    const stopped = running.changes.pipe(
      Stream.map(() => now().state),
      Stream.merge(Stream.sync(() => now().state)),
      Stream.filter((state) => state._tag === 'Stopped'),
      Stream.runHead,
      Effect.map(Option.getOrThrow),
      Effect.map(({ why }) => why),
    );
    return { now, stopped };
  });

export const eventually = (assertion: () => void, timeout = 3_000) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout, interval: 5 }));
