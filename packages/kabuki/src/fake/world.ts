import { Effect, Layer, Schema, Stream, SubscriptionRef } from 'effect';
import type { ErrorOf, Fake, NeedsOf, OutOf } from './fake.ts';

/*
 * A FakeWorld is an app's Fakes together. It keeps nothing: each build of
 * its Layer is a world of its own.
 *
 * 1. Start    in the Layer's Scope, each Fake's state, from `start` if it
 *             names the Fake, else from its `initial`.
 * 2. Serve    each Fake's Layer over its state, all merged into one.
 * 3. Tell     every Fake as it is now, and again after any change, to
 *             whoever reads `fakes`.
 * 4. Control  a control run by name, its payload decoded by its Schema, on
 *             the state the app is reading.
 *
 * `fakes` and `control` follow the latest build still open: building the
 * Layer again starts a new world beside the first, its own states read by
 * its own Layers, and they follow it until its Scope closes, then the one
 * built before it, if it is still open. With none open, `fakes` is empty
 * and `control` says the world has not started.
 */

/** A Schema a Fake reads without services and at once. */
type Codec<T> = Schema.Codec<T, unknown, never, never>;

/** One Fake as it is now, enough to draw its state and a form per control. */
export interface FakeNow {
  readonly name: string;
  /** The Schema of its state. */
  readonly state: Codec<unknown>;
  /** Its state now. */
  readonly value: unknown;
  /** Its controls, in the order written, each with the Schema of its payload. */
  readonly controls: ReadonlyArray<{
    readonly name: string;
    readonly payload: Codec<unknown>;
  }>;
}

/** Where some of a world's Fakes start, in place of their `initial`, by name. */
export type StartOf<Fakes extends ReadonlyArray<Fake>> = {
  readonly [F in Fakes[number] as F['name']]?: F['initial'];
};

/** An app's Fakes together, as `FakeWorld.make` makes them. */
export interface FakeWorld<Out = never, E = any, R = any> {
  /** Every Fake's service merged. Built, it starts a world; its Scope closed, the world ends. */
  readonly layer: Layer.Layer<Out, E, R>;
  /** Every Fake as it is now, and again after any change; none while no build of `layer` is open. */
  readonly fakes: Stream.Stream<ReadonlyArray<FakeNow>>;
  /**
   * Runs one control of one Fake by name, its payload as DevTools sends it.
   * It ends `'done'`, or fails saying why: no such Fake or control, a
   * payload its Schema refuses, no world started, or the control's own reason.
   */
  control(
    fake: string,
    control: string,
    payload: unknown,
  ): Effect.Effect<'done', string>;
}

// The name of a Fake, when it is known to the type: a wide `string` is
// checked when the world is made.
type Known<F> =
  F extends Fake<infer Name> ? (string extends Name ? never : Name) : never;

// A name two Fakes in the list share, if any.
type Repeated<Fakes> = Fakes extends readonly [infer F, ...infer Rest]
  ? [Known<F>] extends [never]
    ? Repeated<Rest>
    : Known<F> extends Known<Rest[number]>
      ? Known<F>
      : Repeated<Rest>
  : never;

type Unique<Fakes> = [Repeated<Fakes>] extends [never]
  ? unknown
  : { readonly [N in `two Fakes are named ${Repeated<Fakes>}`]: never };

/** One Fake started: the Fake, and the state its Layer reads. */
interface Started {
  readonly fake: Fake;
  readonly state: SubscriptionRef.SubscriptionRef<unknown>;
}

/** One build of the Layer: its Fakes started, by name, in the order given. */
type Build = ReadonlyMap<string, Started>;

const nowOf = (fake: Fake, value: unknown): FakeNow => ({
  name: fake.name,
  state: fake.state,
  value,
  controls: Object.entries(fake.controls).map(([name, { payload }]) => ({
    name,
    payload,
  })),
});

const make = <const Fakes extends ReadonlyArray<Fake>>(
  fakes: Fakes & Unique<Fakes>,
  options: { readonly start?: StartOf<Fakes> } = {},
): FakeWorld<
  OutOf<Fakes[number]>,
  ErrorOf<Fakes[number]>,
  NeedsOf<Fakes[number]>
> => {
  const list: ReadonlyArray<Fake> = fakes;
  const start: { readonly [name: string]: unknown } = options.start ?? {};
  const names = new Set<string>();
  for (const { name } of list) {
    if (names.has(name))
      throw new Error(
        `[@kestack/kabuki] FakeWorld: two Fakes are named ${name}`,
      );
    names.add(name);
  }
  for (const name of Object.keys(start))
    if (!names.has(name))
      throw new Error(
        `[@kestack/kabuki] FakeWorld: start names ${name}, which is not one of its Fakes`,
      );

  // The builds open now, oldest first: the last is the one followed.
  const builds = Effect.runSync(SubscriptionRef.make<ReadonlyArray<Build>>([]));

  // 1. Start
  const startOf = (fake: Fake) =>
    SubscriptionRef.make<unknown>(
      Object.hasOwn(start, fake.name) ? start[fake.name] : fake.initial,
    );

  // 2. Serve
  const layer = Layer.unwrap(
    Effect.gen(function* () {
      const states = yield* Effect.forEach(list, startOf);
      const build: Build = new Map(
        list.map((fake, i) => [fake.name, { fake, state: states[i]! }]),
      );
      yield* Effect.acquireRelease(
        SubscriptionRef.update(builds, (open) => [...open, build]),
        () =>
          SubscriptionRef.update(builds, (open) =>
            open.filter((one) => one !== build),
          ),
      );
      const [first, ...rest] = list.map((fake, i) => fake.layer(states[i]!));
      return first ? Layer.mergeAll(first, ...rest) : Layer.empty;
    }),
  );

  // 3. Tell
  const fakesOf = (build: Build | undefined) => {
    const started = build ? [...build.values()] : [];
    if (started.length === 0) return Stream.succeed<ReadonlyArray<FakeNow>>([]);
    return Stream.zipLatestAll(
      ...started.map(({ fake, state }) =>
        SubscriptionRef.changes(state).pipe(
          Stream.map((value) => nowOf(fake, value)),
        ),
      ),
    );
  };
  const told: Stream.Stream<ReadonlyArray<FakeNow>> = SubscriptionRef.changes(
    builds,
  ).pipe(Stream.switchMap((open) => fakesOf(open.at(-1))));

  // 4. Control
  const control = (fake: string, name: string, payload: unknown) =>
    Effect.gen(function* () {
      const build = (yield* SubscriptionRef.get(builds)).at(-1);
      if (!build)
        return yield* Effect.fail(
          'The Fake World has not started: build its layer first',
        );
      const started = build.get(fake);
      if (!started) return yield* Effect.fail(`No Fake is named ${fake}`);
      const { controls } = started.fake;
      const one = Object.hasOwn(controls, name) ? controls[name] : undefined;
      if (!one) return yield* Effect.fail(`${fake} has no control ${name}`);
      const decoded = yield* Schema.decodeUnknownEffect(one.payload)(
        payload,
      ).pipe(
        Effect.mapError(
          (error) => `${fake} ${name} refuses its payload: ${error.message}`,
        ),
      );
      yield* one.run(decoded, started.state);
      return 'done' as const;
    });

  return {
    layer: layer as Layer.Layer<any, any, any>,
    fakes: told,
    control,
  };
};

/**
 * An app's Fakes together. `make` takes the list, each name once, and where
 * some of them start; its Layer serves them all, and `fakes` and `control`
 * show and drive the world it starts.
 */
export const FakeWorld = { make };
