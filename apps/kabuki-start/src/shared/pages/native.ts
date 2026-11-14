import { Context, Effect, Option, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page } from '@kestack/kabuki/routing';
import { AppInfo } from '@kestack/web-platform/capabilities/app-info';
import { Haptics } from '@kestack/web-platform/capabilities/haptics';
import { LiveActivity } from '@kestack/web-platform/capabilities/live-activity';
import { about } from './metadata/index.ts';

/*
 * The Native page: what the app runs as, from `AppInfo` (a browser, or its
 * Shell on iOS or Android, and the Shell's details), whether a service
 * worker controls the page, three haptics to try, from `Haptics`, and a
 * Live Activity to start, move on and end, from `LiveActivity`. The same
 * page in every one of them: the app's Layer gives each Shell its own
 * Capabilities, and a browser keeps the web's.
 *
 * With `proof` in the query, it runs each haptic once by itself, as soon
 * as the rest is known, and logs one `[native-proof]` line saying all of
 * it, for a native build's check to read from the device's log. With
 * `live=1` too it then starts a Live Activity and leaves it running, for
 * the check to see in the Dynamic Island; with `theme=light` or `dark` it
 * first sets the app's Theme, for the check to see the status bar in it.
 */

const Platform = Schema.Literals(['web', 'ios', 'android']);

const Shell = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  version: Schema.String,
  build: Schema.String,
});

const App = Schema.TaggedUnion({
  Checking: {},
  Known: { platform: Platform, shell: Schema.NullOr(Shell) },
});

/** Whether a service worker is there, and controls this page. */
const ServiceWorker = Schema.Literals([
  'checking',
  'unsupported',
  'unregistered',
  'registered',
  'controlling',
]);

const Kind = Schema.Literals(['impact', 'notify', 'selection']);

/** What a haptic came to: not tried yet, or whether the device took it. */
const Result = Schema.Literals(['idle', 'took', 'refused']);

const Results = Schema.Struct({
  impact: Result,
  notify: Result,
  selection: Result,
});

/** The proof run: not started, running, or its line logged. */
const Proof = Schema.Literals(['idle', 'running', 'done']);

/** Whether this device can show a Live Activity: `checking` until it says. */
const LiveSupported = Schema.Literals(['checking', 'yes', 'no']);

/** Where the page's Live Activity is. */
const LiveState = Schema.Literals(['idle', 'running', 'ended', 'unsupported']);

const Live = Schema.Struct({
  supported: LiveSupported,
  state: LiveState,
  /** The last one started, kept once it ends. */
  id: Schema.NullOr(Schema.String),
  /** How far along it is, from 0 to 1. */
  progress: Schema.Number,
});

const ThemeName = Schema.Literals(['light', 'dark']);

type ThemeName = typeof ThemeName.Type;

/**
 * Sets the app's Theme, as the header's toggle does. The browser's Layer
 * gives it; anywhere else it sets nothing.
 */
export const AppTheme = Context.Reference<{
  readonly set: (theme: ThemeName) => Effect.Effect<void>;
}>('kabuki-start/AppTheme', {
  defaultValue: () => ({ set: () => Effect.void }),
});

type Kind = typeof Kind.Type;

const haptic = (kind: Kind) =>
  Effect.gen(function* () {
    const haptics = yield* Haptics;
    if (kind === 'impact') return yield* haptics.impact('medium');
    if (kind === 'notify') return yield* haptics.notify('success');
    return yield* haptics.selection;
  });

/** How long a service worker may take to be ready, on a first visit, before the page settles. */
const READY_WITHIN = '8 seconds';

/**
 * Whether a service worker controls this page. One registered on this
 * visit claims the page just after it is ready, so a page not yet
 * controlled waits for that.
 */
const serviceWorker = Effect.gen(function* () {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return 'unsupported' as const;
  const container = navigator.serviceWorker;
  if (container.controller) return 'controlling' as const;
  const controlled = yield* Effect.callback<void>((resume) => {
    const claimed = () => resume(Effect.void);
    container.addEventListener('controllerchange', claimed, { once: true });
    return Effect.sync(() =>
      container.removeEventListener('controllerchange', claimed),
    );
  }).pipe(Effect.timeoutOption(READY_WITHIN));
  if (Option.isSome(controlled) || container.controller)
    return 'controlling' as const;
  const registration = yield* Effect.tryPromise(() =>
    container.getRegistration(),
  ).pipe(Effect.orElseSucceed(() => undefined));
  return registration ? ('registered' as const) : ('unregistered' as const);
});

const TITLE = 'Kabuki Start';

/** Each Update moves the Live Activity on by a quarter. */
const STEP = 0.25;

/** The status line for how far along it is. */
const status = (progress: number) =>
  progress >= 1 ? 'Done' : `${Math.round(progress * 100)}% there`;

const startLive = Command.make('startLive', {
  args: Schema.Struct({}),
  run: () =>
    Effect.gen(function* () {
      const live = yield* LiveActivity;
      const id = yield* live.start({
        title: TITLE,
        status: status(0),
        progress: 0,
      });
      return { _tag: 'LiveStarted' as const, id: Option.getOrNull(id) };
    }),
});

const updateLive = Command.make('updateLive', {
  args: Schema.Struct({ id: Schema.String, progress: Schema.Number }),
  run: ({ id, progress }) =>
    Effect.gen(function* () {
      const live = yield* LiveActivity;
      const took = yield* live.update(id, {
        status: status(progress),
        progress,
      });
      return { _tag: 'LiveUpdated' as const, took, progress };
    }),
});

const endLive = Command.make('endLive', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.gen(function* () {
      const live = yield* LiveActivity;
      return { _tag: 'LiveEnded' as const, took: yield* live.end(id) };
    }),
});

const buzz = Command.make('buzz', {
  args: Schema.Struct({ kind: Kind }),
  run: ({ kind }) =>
    haptic(kind).pipe(
      Effect.map((took) => ({ _tag: 'Buzzed' as const, kind, took })),
    ),
});

/** What the proof run starts by itself, with `live=1`, and leaves running. */
const PROOF_ACTIVITY = {
  title: TITLE,
  status: 'Proving the Dynamic Island',
  progress: 0.4,
};

const prove = Command.make('prove', {
  args: Schema.Struct({
    platform: Platform,
    shell: Schema.NullOr(Shell),
    serviceWorker: ServiceWorker,
    theme: Schema.NullOr(ThemeName),
    supported: Schema.Boolean,
    live: Schema.Boolean,
  }),
  run: ({ platform, shell, serviceWorker, theme, supported, live }) =>
    Effect.gen(function* () {
      if (theme !== null) yield* (yield* AppTheme).set(theme);
      const haptics = {
        impact: yield* haptic('impact'),
        notify: yield* haptic('notify'),
        selection: yield* haptic('selection'),
      };
      const id = live
        ? Option.getOrNull(yield* (yield* LiveActivity).start(PROOF_ACTIVITY))
        : null;
      const liveActivity = { supported, id };
      yield* Effect.sync(() =>
        console.log(
          `[native-proof] ${JSON.stringify({ platform, shell, serviceWorker, haptics, liveActivity })}`,
        ),
      );
      return { _tag: 'Proved' as const, ...haptics, id };
    }),
});

const NativeModel = Schema.Struct({
  app: App,
  serviceWorker: ServiceWorker,
  results: Results,
  live: Live,
  proof: Proof,
});

type Model = typeof NativeModel.Type;

export const Native = Page.define({
  path: '/native',
  query: {
    proof: Schema.optionalKey(Schema.String),
    live: Schema.optionalKey(Schema.String),
    theme: Schema.optionalKey(Schema.String),
  },
  requires: [AppInfo, Haptics, LiveActivity, AppTheme],
  metadata: about(
    '/native',
    'Native',
    'The same page in a browser and in the app on iOS and Android: what it runs as, haptics to try, and a Live Activity.',
  ),
  model: NativeModel,
  message: {
    Known: { platform: Platform, shell: Schema.NullOr(Shell) },
    ServiceWorkerKnown: { serviceWorker: ServiceWorker },
    Buzz: { kind: Kind },
    Buzzed: { kind: Kind, took: Schema.Boolean },
    LiveKnown: { supported: Schema.Boolean },
    LiveStart: {},
    LiveStarted: { id: Schema.NullOr(Schema.String) },
    LiveUpdate: {},
    LiveUpdated: { took: Schema.Boolean, progress: Schema.Number },
    LiveEnd: {},
    LiveEnded: { took: Schema.Boolean },
    Proved: {
      impact: Schema.Boolean,
      notify: Schema.Boolean,
      selection: Schema.Boolean,
      id: Schema.NullOr(Schema.String),
    },
  },
});

const result = (took: boolean) => (took ? 'took' : 'refused');

interface Query {
  readonly proof?: string;
  readonly live?: string;
  readonly theme?: string;
}

/**
 * The page as `model` leaves it, with the proof run asked for once all it
 * logs is known, if the query asks for one and it has not run.
 */
const settled = (model: Model, query: Query) =>
  query.proof === undefined ||
  model.proof !== 'idle' ||
  model.app._tag !== 'Known' ||
  model.serviceWorker === 'checking' ||
  model.live.supported === 'checking'
    ? { model }
    : {
        model: { ...model, proof: 'running' as const },
        command: prove({
          platform: model.app.platform,
          shell: model.app.shell,
          serviceWorker: model.serviceWorker,
          theme:
            query.theme === 'light' || query.theme === 'dark'
              ? query.theme
              : null,
          supported: model.live.supported === 'yes',
          live: query.live === '1',
        }),
      };

export const NativeLive = Native.build({
  init: () => ({
    model: {
      app: { _tag: 'Checking' },
      serviceWorker: 'checking',
      results: { impact: 'idle', notify: 'idle', selection: 'idle' },
      live: { supported: 'checking', state: 'idle', id: null, progress: 0 },
      proof: 'idle',
    },
  }),
  workers: {
    app: {
      while: ({ model }) => model.app._tag === 'Checking',
      run: (self) =>
        Effect.gen(function* () {
          const { platform, shell } = yield* AppInfo;
          yield* self.send({
            _tag: 'Known',
            platform,
            shell: Option.getOrNull(yield* shell),
          });
        }),
    },
    serviceWorker: {
      while: ({ model }) => model.serviceWorker === 'checking',
      run: (self) =>
        Effect.flatMap(serviceWorker, (serviceWorker) =>
          self.send({ _tag: 'ServiceWorkerKnown', serviceWorker }),
        ),
    },
    live: {
      while: ({ model }) => model.live.supported === 'checking',
      run: (self) =>
        Effect.gen(function* () {
          const supported = yield* (yield* LiveActivity).supported;
          yield* self.send({ _tag: 'LiveKnown', supported });
        }),
    },
  },
  on: {
    Known: ({ platform, shell }, { model, props }) =>
      settled(
        { ...model, app: { _tag: 'Known', platform, shell } },
        props.query,
      ),
    ServiceWorkerKnown: ({ serviceWorker }, { model, props }) =>
      settled({ ...model, serviceWorker }, props.query),
    Buzz: ({ kind }) => ({ command: buzz({ kind }) }),
    Buzzed: ({ kind, took }, { model }) => ({
      model: { results: { ...model.results, [kind]: result(took) } },
    }),
    LiveKnown: ({ supported }, { model, props }) =>
      settled(
        {
          ...model,
          live: {
            ...model.live,
            supported: supported ? 'yes' : 'no',
            state: supported ? model.live.state : 'unsupported',
          },
        },
        props.query,
      ),
    // One at a time, so the page always knows which it moves on.
    LiveStart: (_, { model }) =>
      model.live.supported === 'yes' && model.live.state !== 'running'
        ? { command: startLive({}) }
        : {},
    LiveStarted: ({ id }, { model }) =>
      id === null
        ? {}
        : {
            model: {
              live: { ...model.live, state: 'running', id, progress: 0 },
            },
          },
    LiveUpdate: (_, { model }) =>
      model.live.state === 'running' && model.live.id !== null
        ? {
            command: updateLive({
              id: model.live.id,
              progress: Math.min(1, model.live.progress + STEP),
            }),
          }
        : {},
    LiveUpdated: ({ took, progress }, { model }) =>
      took ? { model: { live: { ...model.live, progress } } } : {},
    LiveEnd: (_, { model }) =>
      model.live.state === 'running' && model.live.id !== null
        ? { command: endLive({ id: model.live.id }) }
        : {},
    LiveEnded: ({ took }, { model }) =>
      took ? { model: { live: { ...model.live, state: 'ended' } } } : {},
    Proved: ({ impact, notify, selection, id }, { model }) => ({
      model: {
        results: {
          impact: result(impact),
          notify: result(notify),
          selection: result(selection),
        },
        live:
          id === null
            ? model.live
            : {
                ...model.live,
                state: 'running',
                id,
                progress: PROOF_ACTIVITY.progress,
              },
        proof: 'done',
      },
    }),
  },
});
