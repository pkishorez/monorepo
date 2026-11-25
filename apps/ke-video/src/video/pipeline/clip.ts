import { join } from 'node:path';
import { Effect, Result } from 'effect';
import type { Cuts, Files, Range } from '../library/index.ts';
import { clipPlan, type ClipPlan } from './edit/index.ts';
import {
  encoder,
  encoderArgs,
  exists,
  Failed,
  folder,
  lines,
  move,
  probe,
  readJson,
  remove,
  writeJson,
  type Encoder,
} from './machine/index.ts';

/*
 * A clip of one removed part of the original, to see and hear it with
 * what comes just before and after: small H.264 and AAC that plays in any
 * browser, made once and kept in `work/clips/<n>.mp4`.
 */

/** A made clip: its file, and the seconds of it the cut removed. */
export interface Clip {
  readonly file: string;
  readonly removed: ReadonlyArray<Range>;
}

/** Bits per second the hardware encoder aims at for a clip. */
const BITRATE = 2e6;

const BASE = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'] as const;

/** ffmpeg's arguments for the clip of `planned` from `original` into `out`. */
const clipArgs = (
  original: string,
  planned: ClipPlan,
  picture: Encoder,
  out: string,
): ReadonlyArray<string> => {
  const inputs = planned.ranges.flatMap((range) => [
    '-ss',
    range.start.toFixed(3),
    '-t',
    (range.end - range.start).toFixed(3),
    '-i',
    original,
  ]);
  const each = planned.ranges.map(
    (_, i) =>
      `[${i}:v:0]scale=-2:'trunc(min(720,ih)/2)*2',setsar=1,format=yuv420p[v${i}];[${i}:a:0]aresample=async=1[a${i}]`,
  );
  const joined = planned.ranges.map((_, i) => `[v${i}][a${i}]`).join('');
  return [
    ...BASE,
    ...inputs,
    '-filter_complex',
    `${each.join(';')};${joined}concat=n=${planned.ranges.length}:v=1:a=1[v][a]`,
    '-map',
    '[v]',
    '-map',
    '[a]',
    ...encoderArgs(picture, BITRATE),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    out,
  ];
};

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The clip of removed part `n` (its place in `cuts.json`'s `removed`) of
 * the Video `id`: 2 s before it to 1.5 s after it, a long one shortened
 * to its start and end. Made once into `work/clips/<n>.mp4`, written as
 * `.part` and renamed; made again only when the cut there has changed.
 */
export const clip = (id: string, files: Files, n: number) =>
  Effect.gen(function* () {
    if (!(yield* exists(files.cuts)))
      return yield* new Failed({
        message: `${id} has no cuts yet: its clean-up step is not done.`,
      });
    const cuts = (yield* readJson(files.cuts)) as Cuts;
    const cut = Number.isInteger(n) ? cuts.removed[n] : undefined;
    if (cut === undefined)
      return yield* new Failed({
        message:
          cuts.removed.length === 0
            ? `${id} has no cut ${n}: nothing was removed.`
            : `${id} has no cut ${n}: its cuts are 0 to ${cuts.removed.length - 1}.`,
      });
    if (!(yield* exists(files.original)))
      return yield* new Failed({
        message: `The original of ${id} is not downloaded (${files.original} is missing), so its cuts cannot be played.`,
      });
    const clips = join(files.folder, 'work', 'clips');
    const file = join(clips, `${n}.mp4`);
    const about = join(clips, `${n}.json`);
    const source = { start: cut.start, end: cut.end };
    if ((yield* exists(file)) && (yield* exists(about))) {
      const kept = (yield* readJson(about).pipe(
        Effect.orElseSucceed(() => null),
      )) as { cut?: unknown; removed?: ReadonlyArray<Range> } | null;
      if (kept !== null && same(kept.cut, source) && kept.removed !== undefined)
        return { file, removed: kept.removed } satisfies Clip;
    }
    const original = yield* probe(files.original);
    const planned = clipPlan(source, original.duration);
    yield* folder(clips);
    const part = `${file}.${process.pid}.part`;
    const make = (picture: Encoder) =>
      lines('ffmpeg', clipArgs(files.original, planned, picture, part)).pipe(
        Effect.map((ended) =>
          ended.code === 0 ? Result.succeed(ended) : Result.fail(ended),
        ),
      );
    const first = yield* encoder;
    let made = yield* make(first);
    if (Result.isFailure(made) && first === 'videotoolbox')
      made = yield* make('x264');
    if (Result.isFailure(made)) {
      yield* remove(part);
      return yield* new Failed({
        message: `ffmpeg could not make the clip of cut ${n}: ${made.failure.tail.at(-1) ?? `it exited with ${made.failure.code}`}`,
      });
    }
    yield* move(part, file);
    yield* writeJson(about, { cut: source, ...planned });
    return { file, removed: planned.removed } satisfies Clip;
  });
