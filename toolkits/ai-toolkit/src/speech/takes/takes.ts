import {
  Clock,
  Data,
  Effect,
  Fiber,
  Queue,
  type Scope,
  Stream,
  SubscriptionRef,
} from 'effect';

/*
 * Takes: Dictations heard as they are recorded. A Take is one recording,
 * named by its id, its audio arriving in numbered stretches while it is
 * still being recorded, and its text going back out as it is heard.
 *
 * 1. Start   whatever reaches a Take first starts it: watching it, a
 *            stretch of audio, or its end. Speech to Text off, it is
 *            switched on; while the model downloads, the Take says how far
 *            it has come, and keeps the audio.
 * 2. Hear    each time audio comes in, what is not settled yet, the tail,
 *            is transcribed, and the settled text goes out with it. A tail
 *            past TAIL is cut at its quietest moment, and the part before
 *            the cut settles, so a pass never grows with the recording.
 * 3. End     once every stretch its end counted is in, the tail is
 *            transcribed once more, and the Take is Done with the whole
 *            text.
 * 4. Forget  a Take nobody has touched for IDLE is dropped.
 *
 * Watching again, as after a reconnect, starts from what is heard now. A
 * stretch sent again is ignored.
 */

/** What a Take has heard so far. */
export type TakeHeard =
  /** The model is downloading: bytes of `total`, once known. */
  | {
      readonly _tag: 'Downloading';
      readonly done: number;
      readonly total: number | null;
    }
  /** The text so far; more may come. */
  | { readonly _tag: 'Heard'; readonly text: string }
  /** The whole text: nothing more comes. */
  | { readonly _tag: 'Done'; readonly text: string };

/** The model could not hear a Take. */
export class TakeFailed extends Data.TaggedError('TakeFailed')<{
  readonly message: string;
}> {}

/** How the model stands, as far as a Take needs it. */
export type ModelNow =
  | { readonly _tag: 'Off' }
  | {
      readonly _tag: 'Downloading';
      readonly done: number;
      readonly total: number | null;
    }
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Failed'; readonly reason: string };

/** What Takes stand on: the model, and how to switch it on. */
export interface TakesModel {
  /** How the model stands now, then each change. */
  readonly now: Stream.Stream<ModelNow>;
  /** Switches Speech to Text on. */
  readonly enable: Effect.Effect<void>;
  /** The text in 16 kHz mono samples, each in [-1, 1]; fails with why. */
  readonly transcribe: (
    samples: Float32Array<ArrayBuffer>,
  ) => Effect.Effect<string, string>;
}

export interface Takes {
  /** What Take `id` has heard now, then each change, ending with Done. */
  readonly watch: (id: string) => Stream.Stream<TakeHeard, TakeFailed>;
  /** Stretch `at`, counted from 0, of Take `id`'s audio. */
  readonly add: (
    id: string,
    at: number,
    samples: Float32Array,
  ) => Effect.Effect<void, TakeFailed>;
  /** Take `id` has `count` stretches; it is Done once all are in. */
  readonly end: (id: string, count: number) => Effect.Effect<void, TakeFailed>;
}

/** The rate of every sample. */
const RATE = 16_000;

/** How long a tail grows before it is cut, in samples. */
export const TAIL = 12 * RATE;

/** How much a cut leaves before it at least, and after it, in samples. */
const KEEP = 4 * RATE;
const AFTER = RATE;

/** How long the quiet a cut looks for is, in samples: 200 ms. */
const QUIET = RATE / 5;

/** How long a Take nobody touches lives, in ms. */
export const IDLE = 10 * 60_000;

/** The most stretches a Take takes: about half an hour of 2 s ones. */
const MOST = 1_000;

/** Where `audio` between `from` and `to` is quietest, over QUIET samples. */
export const quietest = (audio: Float32Array, from: number, to: number) => {
  let best = Math.floor((from + to) / 2);
  let least = Infinity;
  const step = QUIET / 4;
  for (let at = from; at + QUIET <= to; at += step) {
    let power = 0;
    for (let sample = at; sample < at + QUIET; sample++)
      power += (audio[sample] ?? 0) ** 2;
    if (power < least) {
      least = power;
      best = at + QUIET / 2;
    }
  }
  return best;
};

const joined = (settled: string, tail: string) =>
  [settled, tail].filter((text) => text !== '').join(' ');

type Now = TakeHeard | { readonly _tag: 'Failed'; readonly message: string };

interface Take {
  /** Stretches in, by where they go, not yet joined on. */
  readonly waiting: Map<number, Float32Array>;
  /** The audio joined so far, in order: `length` samples of `audio`. */
  audio: Float32Array<ArrayBuffer>;
  length: number;
  /** How many stretches are joined. */
  next: number;
  /** How many there are, once ended. */
  count: number | null;
  /** The text settled, and where the tail starts. */
  settled: string;
  from: number;
  /** When it was last touched, in ms. */
  touched: number;
  readonly now: SubscriptionRef.SubscriptionRef<Now>;
  readonly wake: Queue.Queue<void>;
  fiber?: Fiber.Fiber<void>;
}

/** Joins every waiting stretch that is next in line. */
const join = (take: Take) => {
  for (;;) {
    const piece = take.waiting.get(take.next);
    if (piece === undefined) return;
    take.waiting.delete(take.next);
    if (take.length + piece.length > take.audio.length) {
      const grown = new Float32Array(
        Math.max(take.audio.length * 2, take.length + piece.length),
      );
      grown.set(take.audio.subarray(0, take.length));
      take.audio = grown;
    }
    take.audio.set(piece, take.length);
    take.length += piece.length;
    take.next++;
  }
};

/** Takes, until the Scope closes, on `model`. */
export const makeTakes = (
  model: TakesModel,
): Effect.Effect<Takes, never, Scope.Scope> =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const takes = new Map<string, Take>();

    // 1. Start: the model Ready, switching it on if it is off, saying how
    // far it has downloaded meanwhile.
    const ready = (take: Take) => {
      let asked = false;
      return model.now.pipe(
        Stream.mapEffect((now) =>
          Effect.gen(function* () {
            // Only as it starts: a download that fails after is the Take's failure.
            const first = !asked;
            asked = true;
            if (first && (now._tag === 'Off' || now._tag === 'Failed')) {
              yield* model.enable;
              return false;
            }
            if (now._tag === 'Failed') return yield* Effect.fail(now.reason);
            if (now._tag === 'Downloading')
              yield* SubscriptionRef.set(take.now, {
                _tag: 'Downloading',
                done: now.done,
                total: now.total,
              });
            return now._tag === 'Ready';
          }),
        ),
        Stream.filter((isReady) => isReady),
        Stream.runHead,
      );
    };

    // 2. Hear, then 3. End.
    const hear = (take: Take) =>
      Effect.gen(function* () {
        yield* ready(take);
        for (;;) {
          yield* Queue.take(take.wake);
          join(take);
          while (take.length - take.from > TAIL) {
            const cut = quietest(
              take.audio,
              take.from + KEEP,
              take.length - AFTER,
            );
            const settled = yield* model.transcribe(
              take.audio.slice(take.from, cut),
            );
            take.settled = joined(take.settled, settled);
            take.from = cut;
          }
          const done = take.count !== null && take.next >= take.count;
          const tail = yield* model.transcribe(
            take.audio.slice(take.from, take.length),
          );
          const text = joined(take.settled, tail);
          yield* SubscriptionRef.set(
            take.now,
            done ? { _tag: 'Done', text } : { _tag: 'Heard', text },
          );
          if (done) return;
        }
      }).pipe(
        Effect.catch((message: string) =>
          SubscriptionRef.set(take.now, { _tag: 'Failed', message }),
        ),
      );

    const touch = (id: string) =>
      Effect.gen(function* () {
        const at = yield* Clock.currentTimeMillis;
        const found = takes.get(id);
        if (found !== undefined) {
          found.touched = at;
          return found;
        }
        const take: Take = {
          waiting: new Map(),
          audio: new Float32Array(TAIL),
          length: 0,
          next: 0,
          count: null,
          settled: '',
          from: 0,
          touched: at,
          now: yield* SubscriptionRef.make<Now>({ _tag: 'Heard', text: '' }),
          wake: yield* Queue.sliding<void>(1),
        };
        takes.set(id, take);
        take.fiber = yield* Effect.forkIn(hear(take), scope);
        return take;
      });

    const wake = (take: Take) => Queue.offer(take.wake, undefined);

    // 4. Forget
    yield* Effect.gen(function* () {
      const at = yield* Clock.currentTimeMillis;
      for (const [id, take] of takes)
        if (at - take.touched > IDLE) {
          takes.delete(id);
          if (take.fiber !== undefined) yield* Fiber.interrupt(take.fiber);
        }
    }).pipe(Effect.delay('1 minute'), Effect.forever, Effect.forkIn(scope));

    return {
      watch: (id) =>
        Stream.unwrap(
          Effect.map(touch(id), (take) =>
            SubscriptionRef.changes(take.now).pipe(
              Stream.takeUntil((now) => now._tag === 'Done'),
              Stream.mapEffect((now) =>
                now._tag === 'Failed'
                  ? Effect.fail(new TakeFailed({ message: now.message }))
                  : Effect.succeed(now),
              ),
            ),
          ),
        ),
      add: (id, at, samples) =>
        !Number.isInteger(at) || at < 0 || at >= MOST
          ? Effect.fail(
              new TakeFailed({ message: `No stretch ${at} in a Take` }),
            )
          : Effect.flatMap(touch(id), (take) =>
              at < take.next || take.waiting.has(at)
                ? Effect.void
                : Effect.andThen(
                    Effect.sync(() => void take.waiting.set(at, samples)),
                    wake(take),
                  ),
            ),
      end: (id, count) =>
        !Number.isInteger(count) || count < 0 || count > MOST
          ? Effect.fail(
              new TakeFailed({ message: `A Take of ${count} stretches` }),
            )
          : Effect.flatMap(touch(id), (take) =>
              Effect.andThen(
                Effect.sync(() => {
                  take.count = count;
                }),
                wake(take),
              ),
            ),
    } satisfies Takes;
  });
