import { Data, Effect } from 'effect';
import {
  appendEvent,
  type Event,
  exists,
  filesOf,
  idOf,
  isLive,
  look,
  lookAll,
  readEvents,
  readEventsFrom,
  readVideo,
  removeVideo,
  STEPS,
  type Strength,
  type Video,
  writeVideo,
} from '../video/library/index.ts';
import {
  requirements,
  start,
  stop as stopWorker,
} from '../video/worker/index.ts';
import * as text from './text.ts';

/*
 * What each command does: it reads and changes the library, starts and
 * stops workers, and prints text for people or JSON for tools. `clip`
 * loads the pipeline for its ffmpeg, only when it runs.
 */

/** A command that cannot do what it was asked; its message says why. */
export class Refused extends Data.TaggedError('Refused')<{
  readonly message: string;
}> {}

const print = (output: string) =>
  Effect.sync(() => {
    process.stdout.write(output);
  });

const printJson = (value: unknown) =>
  print(`${JSON.stringify(value, null, 2)}\n`);

const isActive = (video: Video) =>
  video.state === 'queued' || video.state === 'running';

const alreadyRunning = (id: string) =>
  new Refused({
    message: `${id} is already running. Stop it first: ke-video stop ${id}`,
  });

/** Refuses with the list of requirements when one is missing. */
const check = Effect.gen(function* () {
  const found = yield* requirements;
  if (found.some(({ ok }) => !ok))
    return yield* new Refused({ message: text.missing(found) });
});

const started = (id: string, first: string) =>
  `${first} Its worker has started.\nFollow it with: ke-video logs ${id} -f\n`;

export const create = (link: string, strength: Strength, json: boolean) =>
  Effect.gen(function* () {
    const id = idOf(link);
    if (id === null)
      return yield* new Refused({
        message: `${link} is not a YouTube video link.`,
      });
    if (yield* exists(id))
      return yield* new Refused({
        message: `${id} already exists: resume it with ke-video resume ${id}, or remove it with ke-video delete ${id}`,
      });
    yield* check;
    const at = new Date().toISOString();
    const added = `added ${link} (${strength})`;
    yield* writeVideo({
      id,
      url: link,
      title: null,
      channel: null,
      duration: null,
      strength,
      state: 'queued',
      step: null,
      progress: null,
      latest: added,
      done: [],
      error: null,
      result: null,
      files: filesOf(id),
      createdAt: at,
      updatedAt: at,
    });
    yield* appendEvent(id, { at, step: 'create', text: added });
    yield* start(id);
    yield* json
      ? Effect.flatMap(look(id), printJson)
      : print(started(id, `Added ${id} (${strength}).`));
  });

export const list = (json: boolean) =>
  Effect.flatMap(lookAll, (videos) =>
    json ? printJson(videos) : print(text.table(videos)),
  );

export const status = (id: string, json: boolean) =>
  Effect.gen(function* () {
    const video = yield* look(id);
    if (json) return yield* printJson(video);
    const starts = (yield* readEvents(id)).filter(
      ({ step }) => step === 'create',
    );
    yield* print(text.status(video, starts.at(-1)?.at ?? null, new Date()));
  });

export const logs = (id: string, follow: boolean, json: boolean) =>
  Effect.gen(function* () {
    yield* look(id);
    const tty = !json && process.stdout.isTTY === true;
    const printer = text.printer(tty);
    const write = (events: ReadonlyArray<Event>) =>
      print(
        events
          .map((event) =>
            json ? `${JSON.stringify(event)}\n` : printer.event(event),
          )
          .join(''),
      );
    let offset = 0;
    for (;;) {
      const video = yield* look(id);
      const read = yield* readEventsFrom(id, offset);
      offset = read.offset;
      yield* write(read.events);
      if (!follow || !isActive(video)) break;
      yield* Effect.sleep('200 millis');
    }
    yield* print(printer.end());
  });

export const stop = (id: string, json: boolean) =>
  Effect.gen(function* () {
    const before = yield* readVideo(id);
    if (yield* isLive(id)) yield* stopWorker(id);
    else if (isActive(before)) {
      // Its worker died without saying so: say it now.
      const text = 'stopped: its worker was gone';
      yield* appendEvent(id, {
        at: new Date().toISOString(),
        step: 'stop',
        text,
      });
      yield* writeVideo({
        ...before,
        state: 'stopped',
        latest: text,
        updatedAt: new Date().toISOString(),
      });
    } else return yield* new Refused({ message: `${id} is not running.` });
    const video = yield* look(id);
    yield* json
      ? printJson(video)
      : print(
          `Stopped ${id}${video.step === null ? '' : ` during ${video.step}`}${video.progress === null ? '' : ` (${Math.floor(video.progress * 100)}%)`}.\nResume it with: ke-video resume ${id}\n`,
        );
  });

export const resume = (id: string, json: boolean) =>
  Effect.gen(function* () {
    const video = yield* look(id);
    if (isActive(video)) return yield* alreadyRunning(id);
    const next = STEPS.find((step) => !video.done.includes(step));
    if (next === undefined)
      return yield* new Refused({
        message: `${id} is done: nothing to resume.`,
      });
    yield* check;
    const at = new Date().toISOString();
    const from = `from ${next}`;
    yield* appendEvent(id, { at, step: 'create', label: 'resume', text: from });
    yield* writeVideo({
      ...video,
      state: 'queued',
      progress: null,
      error: null,
      latest: from,
      updatedAt: at,
    });
    yield* start(id);
    yield* json
      ? Effect.flatMap(look(id), printJson)
      : print(started(id, `Resumed ${id} from ${next}.`));
  });

export const remove = (id: string, json: boolean) =>
  Effect.gen(function* () {
    const title = yield* readVideo(id).pipe(
      Effect.map((video) => video.title ?? id),
      Effect.catchTag('DiskError', () => Effect.succeed(id)),
    );
    if (yield* isLive(id)) yield* stopWorker(id);
    const freed = yield* removeVideo(id);
    yield* json
      ? printJson({ id, freed })
      : print(`Deleted ${title} (${text.size(freed)} freed).\n`);
  });

export const clip = (id: string, n: number, json: boolean) =>
  Effect.gen(function* () {
    const video = yield* readVideo(id);
    const pipeline = yield* Effect.promise(
      () => import('../video/pipeline/index.ts'),
    );
    const made = yield* pipeline.clip(id, video.files, n);
    yield* json ? printJson(made) : print(`${made.file}\n`);
  });
