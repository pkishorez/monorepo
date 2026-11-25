import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Effect, Result } from 'effect';
import type { Summary } from '../library/index.ts';
import {
  batches,
  frames,
  lines as fullLines,
  sampleCutter,
  shortTime,
  totals,
  trimmed,
  type Plan,
  type Sentence,
  type Word,
} from './edit/index.ts';
import {
  aboutOf,
  fail,
  progress,
  remember,
  say,
  since,
  skillFile,
  workFiles,
  type Job,
} from './job.ts';
import {
  Claude,
  encoder,
  encoderArgs,
  exists,
  folder,
  lines,
  move,
  pipe,
  probe,
  progressTime,
  readJson,
  remove,
  selectFilter,
  write,
  writeJson,
  type Encoder,
  type Ended,
  type Info,
  type Probe,
} from './machine/index.ts';
import {
  askTwice,
  count,
  decodeSummary,
  length,
  summaryMarkdown,
  summaryPrompt,
  took,
  transcriptMarkdown,
} from './text/index.ts';

/**
 * Most kept ranges in one ffmpeg run of the picture. ffmpeg 9 refuses a
 * `select` expression of more than 100 summed terms ("Cannot allocate
 * memory"), so stay well under it.
 */
const BATCH = 80;

/** Seconds read before and after a batch's ranges. */
const MARGIN = 1;

/** How far the short video's length may be from the plan's, in seconds. */
const LENGTH_SLACK = 1;

const hash = (value: unknown) =>
  createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 12);

const tail = (ended: Ended) => ended.tail.slice(-3).join('\n');

const BASE = ['-hide_banner', '-nostdin', '-y', '-nostats'] as const;

/** One batch of kept frames → its own mp4 of picture only, from a window of the original read on its own. */
const renderBatch = (
  job: Job,
  input: {
    readonly made: Plan;
    readonly original: Probe;
    readonly kept: ReadonlyArray<readonly [number, number]>;
    readonly picture: Encoder;
    readonly file: string;
    readonly report: (frames: number) => Effect.Effect<void>;
  },
) =>
  Effect.gen(function* () {
    const { made, kept, file } = input;
    const first = kept[0]!;
    const last = kept[kept.length - 1]!;
    const from = Math.max(0, made.origin + first[0] / made.fps - MARGIN);
    const to = made.origin + last[1] / made.fps + MARGIN;
    const script = `${file}.filter`;
    yield* write(script, selectFilter(kept, made.fps, made.origin, from));
    const ended = yield* lines(
      'ffmpeg',
      [
        ...BASE,
        '-progress',
        'pipe:1',
        '-ss',
        from.toFixed(6),
        '-t',
        (to - from).toFixed(6),
        '-i',
        job.files.original,
        '-map',
        '0:v:0',
        '-an',
        '-sn',
        '-dn',
        '-/filter:v',
        script,
        ...encoderArgs(input.picture, input.original.bitrate),
        '-fps_mode',
        'passthrough',
        '-f',
        'mp4',
        `${file}.part`,
      ],
      (line, stream) => {
        const time = stream === 'out' ? progressTime(line) : null;
        return time === null ? Effect.void : input.report(time * made.fps);
      },
    );
    if (ended.code !== 0) return ended;
    yield* move(`${file}.part`, file);
    return ended;
  });

/** The picture of every batch, in order; VideoToolbox failing, all again with libx264. */
const renderPicture = (
  job: Job,
  made: Plan,
  original: Probe,
  report: (fraction: number) => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const files = workFiles(job);
    const kept = frames(made.kept, made.fps, made.origin);
    const total = kept.reduce((sum, [a, b]) => sum + b - a, 0);
    const groups = batches(kept, BATCH);
    const tryWith = (picture: Encoder) =>
      Effect.gen(function* () {
        const parts: Array<string> = [];
        let done = 0;
        for (const [index, group] of groups.entries()) {
          const file = join(
            files.render,
            `${String(index + 1).padStart(4, '0')}-${hash([group, picture, made.fps, made.origin])}.mp4`,
          );
          parts.push(file);
          const size = group.reduce((sum, [a, b]) => sum + b - a, 0);
          if (!(yield* exists(file))) {
            const ended = yield* renderBatch(job, {
              made,
              original,
              kept: group,
              picture,
              file,
              report: (at) => report((done + Math.min(size, at)) / total),
            });
            if (ended.code !== 0) return Result.fail(ended);
          }
          done += size;
        }
        return Result.succeed(parts);
      });
    const first = yield* encoder;
    const tried = yield* tryWith(first);
    if (Result.isSuccess(tried)) return tried.success;
    if (first === 'videotoolbox') {
      yield* say(
        job,
        'render',
        'VideoToolbox failed; encoding with libx264 instead',
      );
      const again = yield* tryWith('x264');
      if (Result.isSuccess(again)) return again.success;
      return yield* fail(
        `ffmpeg could not encode the picture:\n${tail(again.failure)}`,
      );
    }
    return yield* fail(
      `ffmpeg could not encode the picture:\n${tail(tried.failure)}`,
    );
  });

/**
 * The kept sound, exact to the sample: the original decoded, every kept
 * stretch faded in and out over 5 ms so no cut clicks, encoded as AAC.
 */
const renderSound = (job: Job, made: Plan, original: Probe) =>
  Effect.gen(function* () {
    const { sampleRate: rate, channels } = original;
    const kept = made.kept.map(
      (range) =>
        [
          Math.round((range.start - original.audioStart) * rate),
          Math.round((range.end - original.audioStart) * rate),
        ] as const,
    );
    const file = join(
      workFiles(job).render,
      `sound-${hash([kept, rate, channels])}.m4a`,
    );
    if (yield* exists(file)) return file;
    const cutter = sampleCutter(kept, channels);
    const frame = 4 * channels;
    let rest: Buffer = Buffer.alloc(0);
    const change = (chunk: Buffer) => {
      const all = rest.length === 0 ? chunk : Buffer.concat([rest, chunk]);
      const whole = all.length - (all.length % frame);
      rest = Buffer.from(all.subarray(whole));
      const floats = new Float32Array(
        all.buffer.slice(all.byteOffset, all.byteOffset + whole),
      );
      const out = cutter(floats);
      return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
    };
    const raw = ['-f', 'f32le', '-ar', String(rate), '-ac', String(channels)];
    const ended = yield* pipe(
      [
        'ffmpeg',
        [
          ...BASE,
          '-loglevel',
          'error',
          '-i',
          job.files.original,
          '-map',
          '0:a:0',
          ...raw,
          'pipe:1',
        ],
      ],
      [
        'ffmpeg',
        [
          ...BASE,
          '-loglevel',
          'error',
          ...raw,
          '-i',
          'pipe:0',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
          '-f',
          'mp4',
          `${file}.part`,
        ],
      ],
      change,
    );
    if (ended.from.code !== 0)
      return yield* fail(
        `ffmpeg could not decode the sound:\n${tail(ended.from)}`,
      );
    if (ended.to.code !== 0)
      return yield* fail(
        `ffmpeg could not encode the sound:\n${tail(ended.to)}`,
      );
    yield* move(`${file}.part`, file);
    return file;
  });

/**
 * The planned ranges → `video.mp4`: the picture in batches of frames
 * selected from windows of the original, joined with the concat demuxer,
 * and the sound cut exact to the sample; then its length checked.
 */
export const render = (job: Job) =>
  Effect.gen(function* () {
    const files = workFiles(job);
    const started = Date.now();
    const made = (yield* readJson(files.plan)) as Plan;
    const original = yield* probe(job.files.original);
    yield* folder(files.render);
    const report = progress(job, 'render');
    const [parts, sound] = yield* Effect.all(
      [
        renderPicture(job, made, original, (fraction) =>
          report(fraction * 0.98),
        ),
        renderSound(job, made, original),
      ],
      { concurrency: 2 },
    );
    const list = join(files.render, 'parts.txt');
    yield* write(
      list,
      parts.map((part) => `file '${part.replace(/'/g, "'\\''")}'\n`).join(''),
    );
    const joined = yield* lines('ffmpeg', [
      ...BASE,
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-i',
      sound,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      `${job.files.video}.part`,
    ]);
    if (joined.code !== 0)
      return yield* fail(
        `ffmpeg could not join the short video:\n${tail(joined)}`,
      );
    const short = yield* probe(`${job.files.video}.part`);
    if (Math.abs(short.duration - made.length) > LENGTH_SLACK)
      return yield* fail(
        `The short video is ${length(short.duration)} long, but the plan says ${length(made.length)}.`,
      );
    yield* move(`${job.files.video}.part`, job.files.video);
    yield* remove(files.render);
    yield* job.update({
      result: {
        duration: short.duration,
        removed: totals(made.removed),
        cuts: made.removed.length,
      },
    });
    yield* report(
      1,
      `${length(short.duration)} written in ${took(since(started))}; length checked`,
    );
  });

/** What the transcripts and summary are made from. */
const readMade = (job: Job) =>
  Effect.gen(function* () {
    const files = workFiles(job);
    const words = (yield* readJson(files.words)) as ReadonlyArray<Word>;
    const all = (yield* readJson(files.sentences)) as ReadonlyArray<Sentence>;
    const made = (yield* readJson(files.plan)) as Plan;
    const details = (yield* readJson(files.info)) as Info;
    const cut = new Set(
      made.cuts.flatMap((c) =>
        Array.from({ length: c.to - c.from + 1 }, (_, i) => c.from + i),
      ),
    );
    return { all, made, details, short: trimmed(words, all, made.kept, cut) };
  });

/** Every kept word at its time in `video.mp4` → transcript.json, transcript.md, transcript-full.md. */
export const transcripts = (job: Job) =>
  Effect.gen(function* () {
    const { all, details, short } = yield* readMade(job);
    const full = fullLines(all);
    const kept = short.map(({ start, end, text }) => ({ start, end, text }));
    yield* writeJson(job.files.transcriptJson, { full, trimmed: kept });
    yield* write(
      job.files.transcript,
      transcriptMarkdown(
        details.title,
        'The trimmed transcript, at times of the short video.',
        kept,
      ),
    );
    yield* write(
      job.files.transcriptFull,
      transcriptMarkdown(
        details.title,
        'The full transcript, at times of the original video.',
        full,
      ),
    );
    yield* say(job, 'transcripts', 'original and trimmed written');
  });

const wordCount = (text: string) =>
  text.split(/\s+/).filter((w) => w !== '').length;

/** Claude's summary of the trimmed transcript, its sentence numbers as times in both videos → summary.json, summary.md. */
export const summary = (job: Job) =>
  Effect.gen(function* () {
    const { made, details, short } = yield* readMade(job);
    if (short.length === 0)
      return yield* fail('The short video has no sentences to summarise.');
    const map = shortTime(made.kept);
    const about = aboutOf(details);
    const chapters = about.chapters
      .map((chapter) => ({ title: chapter.title, start: map(chapter.start) }))
      .filter(
        (chapter, i, all) => i === 0 || chapter.start > all[i - 1]!.start,
      );
    const claude = yield* Claude;
    const answer = yield* askTwice(
      claude.ask,
      summaryPrompt({
        skill: {
          rules: yield* skillFile(job, 'summary-rules.md'),
          learnings: yield* skillFile(job, 'learnings.md'),
        },
        about: { ...about, chapters },
        sentences: short,
      }),
      decodeSummary(short.length),
    );
    if (Result.isFailure(answer))
      return yield* fail(
        `Claude's summary could not be read twice: ${answer.failure}`,
      );
    const at = (sentence: number) => {
      const line = short[sentence - 1]!;
      return { at: line.start, atOriginal: line.original };
    };
    const result: Summary = {
      overview: answer.success.overview,
      points: answer.success.points.map((point) => ({
        text: point.text,
        ...at(point.sentence),
      })),
      chapters: answer.success.chapters
        .map((chapter) => ({ title: chapter.title, ...at(chapter.sentence) }))
        .sort((a, b) => a.at - b.at),
    };
    yield* writeJson(job.files.summaryJson, result);
    yield* write(job.files.summary, summaryMarkdown(details.title, result));
    yield* remember(job, 'summary', answer.success.learnings);
    const words =
      wordCount(result.overview) +
      result.points.reduce((sum, p) => sum + wordCount(p.text), 0);
    yield* say(
      job,
      'summary',
      `${count(result.chapters.length)} chapters, ${count(words)} words`,
    );
  });
