import {
  appendFileSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { Data, Effect, Exit, Schema } from 'effect';
import { folders } from '@kestack/cli-platform/files';
import { Event, type Files, Video } from './schema.ts';

/*
 * Where every Video lives on disk: the library root, one folder per Video,
 * its record `video.json`, rewritten whole, and its Events `log.jsonl`,
 * only ever added to.
 */

/** There is no Video of this id. */
export class NotFound extends Data.TaggedError('NotFound')<{
  readonly id: string;
  readonly message: string;
}> {}

/** A file of the library could not be read or written. */
export class DiskError extends Data.TaggedError('DiskError')<{
  readonly message: string;
}> {}

const notFound = (id: string) =>
  new NotFound({ id, message: `No video ${id}. See them with: ke-video list` });

const diskError = (what: string) => (cause: unknown) =>
  new DiskError({
    message: `${what}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

/** What a folder name of the library may be, so an id never leaves it. */
const ID = /^[A-Za-z0-9_-]+$/;

/** The library root: `$KE_VIDEO_HOME`, else `<shared>/ke-video`. */
export const root = () => {
  const home = process.env['KE_VIDEO_HOME'];
  return home !== undefined && home !== ''
    ? resolve(home)
    : join(folders({ app: 'ke-video', name: 'main' }).shared, 'ke-video');
};

/** The speech model's folder. */
export const modelFolder = () => join(root(), 'model');

const videosFolder = () => join(root(), 'videos');

/** Every file of the Video `id`, by the name its record gives it. */
export const filesOf = (id: string): Files => {
  const folder = join(videosFolder(), id);
  return {
    folder,
    video: join(folder, 'video.mp4'),
    transcript: join(folder, 'transcript.md'),
    transcriptFull: join(folder, 'transcript-full.md'),
    transcriptJson: join(folder, 'transcript.json'),
    summary: join(folder, 'summary.md'),
    summaryJson: join(folder, 'summary.json'),
    cuts: join(folder, 'cuts.json'),
    original: join(folder, 'work', 'original.mp4'),
  };
};

/** The Video's work folder, where its worker logs. */
export const workOf = (id: string) => join(filesOf(id).folder, 'work');

const recordOf = (id: string) => join(filesOf(id).folder, 'video.json');
const logOf = (id: string) => join(filesOf(id).folder, 'log.jsonl');

/** Whether the Video `id` has a folder. */
export const exists = (id: string) =>
  Effect.sync(() => ID.test(id) && existsSync(filesOf(id).folder));

const decodeVideo = Schema.decodeUnknownEffect(Schema.fromJsonString(Video));

/** The record of the Video `id`. */
export const readVideo = (id: string) =>
  Effect.gen(function* () {
    if (!ID.test(id) || !existsSync(recordOf(id))) return yield* notFound(id);
    const text = yield* Effect.try({
      try: () => readFileSync(recordOf(id), 'utf8'),
      catch: diskError(`Could not read the record of ${id}`),
    });
    return yield* decodeVideo(text).pipe(
      Effect.mapError(
        (error) =>
          new DiskError({
            message: `The record of ${id} is broken (${error.message}); remove it with ke-video delete ${id}`,
          }),
      ),
    );
  });

/** Writes `video` as its record, whole: a reader sees the old one or the new one. */
export const writeVideo = (video: Video) =>
  Effect.try({
    try: () => {
      const path = recordOf(video.id);
      const part = `${path}.${process.pid}.part`;
      mkdirSync(video.files.folder, { recursive: true });
      writeFileSync(part, `${JSON.stringify(video, null, 2)}\n`);
      renameSync(part, path);
    },
    catch: diskError(`Could not write the record of ${video.id}`),
  });

/** Every Video, newest first. */
export const listVideos = Effect.gen(function* () {
  const folder = videosFolder();
  const ids = existsSync(folder)
    ? readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && ID.test(entry.name))
        .filter((entry) => existsSync(recordOf(entry.name)))
        .map((entry) => entry.name)
    : [];
  const videos = yield* Effect.forEach(ids, readVideo);
  return videos.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
});

/** Adds `event` to the Video's log. */
export const appendEvent = (id: string, event: Event) =>
  Effect.try({
    try: () => appendFileSync(logOf(id), `${JSON.stringify(event)}\n`),
    catch: diskError(`Could not add to the log of ${id}`),
  });

const decodeEvent = Schema.decodeUnknownExit(Schema.fromJsonString(Event));

/**
 * The Events of the Video `id` whose lines start at byte `offset` or later,
 * and the offset after the last whole line: a line still being written is
 * left for the next read.
 */
export const readEventsFrom = (id: string, offset: number) =>
  Effect.try({
    try: () => {
      const path = logOf(id);
      if (!existsSync(path))
        return { events: [] as ReadonlyArray<Event>, offset };
      const fd = openSync(path, 'r');
      const chunks: Array<Buffer> = [];
      try {
        const buffer = Buffer.alloc(64 * 1024);
        for (let at = offset; ;) {
          const read = readSync(fd, buffer, 0, buffer.length, at);
          if (read === 0) break;
          chunks.push(Buffer.from(buffer.subarray(0, read)));
          at += read;
        }
      } finally {
        closeSync(fd);
      }
      const bytes = Buffer.concat(chunks);
      const whole = bytes.lastIndexOf(0x0a) + 1;
      const events = bytes
        .subarray(0, whole)
        .toString('utf8')
        .split('\n')
        .flatMap((line) => {
          const decoded = line === '' ? null : decodeEvent(line);
          return decoded !== null && Exit.isSuccess(decoded)
            ? [decoded.value]
            : [];
        });
      return { events: events as ReadonlyArray<Event>, offset: offset + whole };
    },
    catch: diskError(`Could not read the log of ${id}`),
  });

/** Every Event of the Video `id` so far. */
export const readEvents = (id: string) =>
  readEventsFrom(id, 0).pipe(Effect.map(({ events }) => events));

const sizeOf = (path: string): number => {
  const stat = lstatSync(path);
  return stat.isDirectory()
    ? readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0)
    : stat.size;
};

/** Removes the Video's folder; the bytes it freed. */
export const removeVideo = (id: string) =>
  Effect.gen(function* () {
    if (!(yield* exists(id))) return yield* notFound(id);
    return yield* Effect.try({
      try: () => {
        const folder = filesOf(id).folder;
        const freed = sizeOf(folder);
        rmSync(folder, { recursive: true, force: true });
        return freed;
      },
      catch: diskError(`Could not remove ${id}`),
    });
  });
