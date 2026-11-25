import { join } from 'node:path';
import { Effect } from 'effect';
import type { Range } from '../library/index.ts';
import { pieces, quietest, toFloat, type Word } from './edit/index.ts';
import {
  fail,
  progress,
  say,
  since,
  StepFailed,
  workFiles,
  type Job,
} from './job.ts';
import {
  capture,
  downloadArgs,
  downloaded,
  downloadLine,
  Ears,
  exists,
  folder,
  infoArgs,
  lines,
  move,
  probe,
  progressTime,
  readBytes,
  readInfo,
  readJson,
  silenceReader,
  writeJson,
  youtubeFailure,
  type Info,
  type Listener,
} from './machine/index.ts';
import { count, length, shorten, size, stamp, took } from './text/index.ts';

/** The rate of `work/audio.pcm`. */
const RATE = 16_000;

/** `yt-dlp -J` → `work/info.json`; sets title, channel and duration. */
export const info = (job: Job) =>
  Effect.gen(function* () {
    const ran = yield* capture('yt-dlp', infoArgs(job.url));
    if (ran.code !== 0)
      return yield* fail(youtubeFailure("read the video's details", ran.tail));
    const json = yield* Effect.try({
      try: () => JSON.parse(ran.out) as unknown,
      catch: () =>
        new StepFailed({
          message: youtubeFailure("read the video's details", [
            'ERROR: it printed no JSON',
          ]),
        }),
    });
    const details = readInfo(json);
    if (details.live)
      return yield* fail(
        `${job.id} is live or has not started yet. Resume it once the stream has ended.`,
      );
    yield* writeJson(workFiles(job).info, details);
    yield* job.update({
      title: details.title,
      channel: details.channel,
      duration: details.duration,
    });
    const chapters = details.chapters.length;
    yield* say(
      job,
      'info',
      `"${details.title}", ${length(details.duration)}, ${chapters === 0 ? 'no' : count(chapters)} chapter${chapters === 1 ? '' : 's'}`,
    );
  });

/** yt-dlp → `work/original.mp4`, its progress in Events. */
export const download = (job: Job) =>
  Effect.gen(function* () {
    const files = workFiles(job);
    const details = (yield* readJson(files.info)) as Info;
    const sizes = details.parts.filter((p): p is number => p !== null);
    yield* say(
      job,
      'download',
      [
        details.height === null ? null : `${details.height}p`,
        sizes.length === details.parts.length && sizes.length > 0
          ? size(sizes.reduce((a, b) => a + b, 0))
          : null,
      ]
        .filter((part) => part !== null)
        .join(', ') || 'starting',
    );
    const started = Date.now();
    const report = progress(job, 'download');
    let part = -1;
    let furthest = 0;
    const ran = yield* lines(
      'yt-dlp',
      downloadArgs(job.url, files.work),
      (text) => {
        const line = downloadLine(text);
        if (line._tag === 'Part') part++;
        return line._tag === 'Percent'
          ? report(
              (furthest = Math.max(
                furthest,
                downloaded(details.parts, Math.max(0, part), line.percent),
              )),
            )
          : Effect.void;
      },
    );
    if (ran.code !== 0)
      return yield* fail(youtubeFailure('download the video', ran.tail));
    if (!(yield* exists(job.files.original)))
      return yield* fail(
        `yt-dlp finished, but ${job.files.original} is not there. ${ran.tail.slice(-2).join(' ')}`,
      );
    yield* report(1, `100% in ${took(since(started))}`);
  });

/** ffmpeg → `work/audio.pcm` (16 kHz mono s16le) and `work/silences.json`, in one pass. */
export const audio = (job: Job) =>
  Effect.gen(function* () {
    const files = workFiles(job);
    const original = yield* probe(job.files.original);
    const report = progress(job, 'audio');
    const silences = silenceReader();
    const ran = yield* lines(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-nostats',
        '-progress',
        'pipe:1',
        '-i',
        job.files.original,
        '-map',
        '0:a:0',
        '-af',
        'silencedetect=noise=-35dB:d=0.25',
        '-ac',
        '1',
        '-ar',
        String(RATE),
        '-f',
        's16le',
        `${files.audio}.part`,
      ],
      (line, from) => {
        if (from === 'err') return Effect.sync(() => silences.line(line));
        const time = progressTime(line);
        return time === null || original.duration <= 0
          ? Effect.void
          : report(time / original.duration);
      },
    );
    if (ran.code !== 0)
      return yield* fail(
        `ffmpeg could not take the sound out of the video:\n${ran.tail.slice(-3).join('\n')}`,
      );
    yield* move(`${files.audio}.part`, files.audio);
    const found = silences.done(original.duration);
    yield* writeJson(files.silences, found);
    yield* say(
      job,
      'audio',
      `sound ready for listening, ${count(found.length)} pause${found.length === 1 ? '' : 's'} found`,
    );
  });

/** What `work/pieces/NNNNN.json` holds: one piece heard, at times of the original. */
interface Piece {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly words: ReadonlyArray<Word>;
}

const samplesOf = (bytes: Uint8Array) =>
  bytes.byteOffset % 2 === 0
    ? new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        Math.floor(bytes.byteLength / 2),
      )
    : new Int16Array(bytes.slice().buffer, 0, Math.floor(bytes.byteLength / 2));

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** A piece heard before, when its file is there for the same stretch. */
const heardBefore = (file: string, start: number, end: number) =>
  Effect.gen(function* () {
    if (!(yield* exists(file))) return null;
    const piece = (yield* readJson(file).pipe(
      Effect.orElseSucceed(() => null),
    )) as Piece | null;
    return piece !== null && close(piece.start, start) && close(piece.end, end)
      ? piece
      : null;
  });

/**
 * The audio in pieces of at most 20 s, each heard into
 * `work/pieces/NNNNN.json` unless heard before; then every word →
 * `work/words.json`.
 */
export const transcribe = (job: Job) =>
  Effect.gen(function* () {
    const files = workFiles(job);
    const started = Date.now();
    const original = yield* probe(job.files.original);
    const offset = original.audioStart;
    const samples = samplesOf(yield* readBytes(files.audio));
    const duration = samples.length / RATE;
    const silences = (yield* readJson(files.silences)) as ReadonlyArray<Range>;
    const cuts = pieces(
      duration,
      silences.map((s) => ({ start: s.start - offset, end: s.end - offset })),
      (from, to) => quietest(samples, RATE, from, to),
    );
    yield* folder(files.pieces);
    const ears = yield* Ears;
    if (!(yield* ears.installed(job.model))) {
      const fetching = progress(job, 'transcribe');
      yield* fetching(0, 'downloading the speech model (first run only)');
      yield* ears.install(job.model, (fraction) =>
        fraction === null ? Effect.void : fetching(fraction),
      );
    }
    const report = progress(job, 'transcribe');
    let listener: Listener | null = null;
    const words: Array<Word> = [];
    for (const [index, cut] of cuts.entries()) {
      const file = join(
        files.pieces,
        `${String(index + 1).padStart(5, '0')}.json`,
      );
      const start = cut.start + offset;
      const end = cut.end + offset;
      let piece = yield* heardBefore(file, start, end);
      if (piece === null) {
        listener ??= yield* ears.load(job.model);
        const heard = yield* listener.hear(
          toFloat(
            samples.subarray(
              Math.round(cut.start * RATE),
              Math.round(cut.end * RATE),
            ),
          ),
        );
        const at = (time: number) =>
          Math.min(end, Math.max(start, start + time));
        piece = {
          start,
          end,
          text: heard.text,
          words: heard.words
            .filter((word) => word.text.trim() !== '')
            .map((word) => ({
              text: word.text.trim(),
              start: at(word.start),
              end: at(word.end),
            })),
        };
        yield* writeJson(file, piece);
        yield* report(
          cut.end / duration,
          piece.text.trim() === ''
            ? undefined
            : `[${stamp(start)}] ${shorten(piece.text.trim())}`,
        );
      }
      words.push(...piece.words);
    }
    yield* writeJson(files.words, words);
    yield* say(
      job,
      'transcribe',
      `${count(words.length)} words in ${took(since(started))}`,
    );
  });
