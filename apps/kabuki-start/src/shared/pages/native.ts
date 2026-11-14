import { Effect, Option, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Page } from '@kestack/kabuki/routing';
import { AppInfo } from '@kestack/web-platform/capabilities/app-info';
import { Haptics } from '@kestack/web-platform/capabilities/haptics';
import { about } from './metadata/index.ts';

/*
 * The Native page: what the app runs as, from `AppInfo` (a browser, or its
 * Shell on iOS or Android, and the Shell's details), whether a service
 * worker controls the page, and three haptics to try, from `Haptics`. The
 * same page in every one of them: the app's Layer gives each Shell its own
 * Capabilities, and a browser keeps the web's.
 *
 * With `proof` in the query, it runs each haptic once by itself, as soon
 * as the rest is known, and logs one `[native-proof]` line saying all of
 * it, for a native build's check to read from the device's log.
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

const buzz = Command.make('buzz', {
  args: Schema.Struct({ kind: Kind }),
  run: ({ kind }) =>
    haptic(kind).pipe(
      Effect.map((took) => ({ _tag: 'Buzzed' as const, kind, took })),
    ),
});

const prove = Command.make('prove', {
  args: Schema.Struct({
    platform: Platform,
    shell: Schema.NullOr(Shell),
    serviceWorker: ServiceWorker,
  }),
  run: ({ platform, shell, serviceWorker }) =>
    Effect.gen(function* () {
      const haptics = {
        impact: yield* haptic('impact'),
        notify: yield* haptic('notify'),
        selection: yield* haptic('selection'),
      };
      yield* Effect.sync(() =>
        console.log(
          `[native-proof] ${JSON.stringify({ platform, shell, serviceWorker, haptics })}`,
        ),
      );
      return { _tag: 'Proved' as const, ...haptics };
    }),
});

const NativeModel = Schema.Struct({
  app: App,
  serviceWorker: ServiceWorker,
  results: Results,
  proof: Proof,
});

type Model = typeof NativeModel.Type;

export const Native = Page.define({
  path: '/native',
  query: { proof: Schema.optionalKey(Schema.String) },
  requires: [AppInfo, Haptics],
  metadata: about(
    '/native',
    'Native',
    'The same page in a browser and in the app on iOS and Android: what it runs as, and haptics to try.',
  ),
  model: NativeModel,
  message: {
    Known: { platform: Platform, shell: Schema.NullOr(Shell) },
    ServiceWorkerKnown: { serviceWorker: ServiceWorker },
    Buzz: { kind: Kind },
    Buzzed: { kind: Kind, took: Schema.Boolean },
    Proved: {
      impact: Schema.Boolean,
      notify: Schema.Boolean,
      selection: Schema.Boolean,
    },
  },
});

const result = (took: boolean) => (took ? 'took' : 'refused');

/**
 * The page as `model` leaves it, with the proof run asked for once all it
 * logs is known, if the query asks for one and it has not run.
 */
const settled = (model: Model, query: { readonly proof?: string }) =>
  query.proof === undefined ||
  model.proof !== 'idle' ||
  model.app._tag !== 'Known' ||
  model.serviceWorker === 'checking'
    ? { model }
    : {
        model: { ...model, proof: 'running' as const },
        command: prove({
          platform: model.app.platform,
          shell: model.app.shell,
          serviceWorker: model.serviceWorker,
        }),
      };

export const NativeLive = Native.build({
  init: () => ({
    model: {
      app: { _tag: 'Checking' },
      serviceWorker: 'checking',
      results: { impact: 'idle', notify: 'idle', selection: 'idle' },
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
    Proved: ({ impact, notify, selection }) => ({
      model: {
        results: {
          impact: result(impact),
          notify: result(notify),
          selection: result(selection),
        },
        proof: 'done',
      },
    }),
  },
});
