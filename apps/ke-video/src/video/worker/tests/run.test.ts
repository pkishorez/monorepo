import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Data, Deferred, Effect, Fiber, Layer } from 'effect';
import { reach } from '@kestack/cli-platform/single';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Event,
  filesOf,
  readEvents,
  readVideo,
  type Step,
  type Video,
  WorkerControl,
  workerSocket,
  writeVideo,
} from '../../library/index.ts';
import { type Job, type Pipeline, work } from '../run.ts';

/* A worker's run in this process, on pipelines made for each test. */

class StepFailed extends Data.TaggedError('StepFailed')<{
  readonly message: string;
}> {}

const pipeline = (
  run: (step: Step, job: Job) => Effect.Effect<void, StepFailed>,
): Pipeline<never> => ({
  run,
  services: Layer.empty,
  requirements: Effect.succeed([]),
});

const queued = (id: string, changes: Partial<Video> = {}): Video => ({
  id,
  url: `https://youtu.be/${id}`,
  title: null,
  channel: null,
  duration: null,
  strength: 'normal',
  state: 'queued',
  step: null,
  progress: null,
  latest: null,
  done: [],
  error: null,
  result: null,
  files: filesOf(id),
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
  ...changes,
});

const add = (id: string, changes: Partial<Video> = {}) =>
  Effect.runPromise(writeVideo(queued(id, changes)));

const record = (id: string) => Effect.runPromise(readVideo(id));

const events = (id: string) => Effect.runPromise(readEvents(id));

const texts = (all: ReadonlyArray<Event>) =>
  all.flatMap(({ step, text }) =>
    text === undefined ? [] : [`${step}: ${text}`],
  );

const stopWorker = (id: string) =>
  Effect.runPromise(
    reach(workerSocket(id), WorkerControl).pipe(
      Effect.flatMap((client) => client.stop()),
      Effect.scoped,
    ),
  );

beforeEach(() => {
  // Short, for a socket path is at most 103 bytes.
  const home = mkdtempSync(
    join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'kv-'),
  );
  process.env['KE_VIDEO_HOME'] = home;
  process.env['XDG_RUNTIME_DIR'] = join(home, 'run');
});

afterEach(() => {
  rmSync(process.env['KE_VIDEO_HOME']!, { recursive: true, force: true });
});

describe('work', () => {
  it('runs every step in order, keeping what each learns, and ends done', async () => {
    await add('aaaaaaaaaaa');
    const ran: Array<Step> = [];
    const outcome = await Effect.runPromise(
      work(
        'aaaaaaaaaaa',
        pipeline((step, job) =>
          Effect.gen(function* () {
            ran.push(step);
            if (step === 'info')
              yield* job.update({ title: 'A talk', duration: 3500 });
            if (step === 'summary')
              yield* job.update({
                result: {
                  duration: 1865,
                  removed: { silence: 1, fillers: 1, ads: 1, fillerTalk: 1 },
                  cuts: 3,
                },
              });
            yield* job.emit({ step, text: `${step} ran` });
          }),
        ),
      ),
    );
    expect(outcome).toBe('done');
    expect(ran).toEqual([
      'info',
      'download',
      'audio',
      'transcribe',
      'clean-up',
      'render',
      'transcripts',
      'summary',
    ]);
    const video = await record('aaaaaaaaaaa');
    expect(video).toMatchObject({
      state: 'done',
      step: null,
      title: 'A talk',
      done: ran,
      latest: '58:20 → 31:05 (47% shorter)',
    });
    expect(texts(await events('aaaaaaaaaaa')).at(-1)).toBe(
      'done: 58:20 → 31:05 (47% shorter)',
    );
  });

  it('runs only the steps not done', async () => {
    await add('bbbbbbbbbbb', {
      state: 'stopped',
      done: ['info', 'download', 'audio'],
    });
    const ran: Array<Step> = [];
    await Effect.runPromise(
      work(
        'bbbbbbbbbbb',
        pipeline((step) => Effect.sync(() => void ran.push(step))),
      ),
    );
    expect(ran[0]).toBe('transcribe');
    expect(ran).toHaveLength(5);
  });

  it('keeps a progress-only Event at most once per whole percent', async () => {
    await add('ccccccccccc');
    await Effect.runPromise(
      work(
        'ccccccccccc',
        pipeline((step, job) =>
          step === 'download'
            ? Effect.forEach(
                Array.from({ length: 1000 }, (_, i) => (i + 1) / 1000),
                (progress) => job.emit({ step, progress }),
              )
            : Effect.void,
        ),
      ),
    );
    const download = (await events('ccccccccccc')).filter(
      ({ step }) => step === 'download',
    );
    // 0% to 100%.
    expect(download).toHaveLength(101);
    expect(download.at(-1)?.progress).toBe(1);
  });

  it('records a failed step with its error, and ends failed', async () => {
    await add('ddddddddddd');
    const outcome = await Effect.runPromise(
      work(
        'ddddddddddd',
        pipeline((step) =>
          step === 'audio'
            ? new StepFailed({ message: 'ffmpeg exited 1' })
            : Effect.void,
        ),
      ),
    );
    expect(outcome).toBe('failed');
    expect(await record('ddddddddddd')).toMatchObject({
      state: 'failed',
      step: 'audio',
      done: ['info', 'download'],
      error: { step: 'audio', message: 'ffmpeg exited 1' },
    });
    expect(texts(await events('ddddddddddd')).at(-1)).toBe(
      'fail: ffmpeg exited 1',
    );
  });

  it('stops when asked on its socket, interrupting the step, and says where', async () => {
    await add('eeeeeeeeeee');
    const interrupted = Effect.runSync(Deferred.make<void>());
    const fiber = Effect.runFork(
      work(
        'eeeeeeeeeee',
        pipeline((step, job) =>
          step === 'transcribe'
            ? job.emit({ step, progress: 0.42 }).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() =>
                  Deferred.succeed(interrupted, undefined),
                ),
              )
            : Effect.void,
        ),
      ),
    );
    await vi.waitFor(async () =>
      expect((await record('eeeeeeeeeee')).progress).toBe(0.42),
    );
    await stopWorker('eeeeeeeeeee');
    expect(await Effect.runPromise(Fiber.join(fiber))).toBe('stopped');
    expect(await Effect.runPromise(Deferred.isDone(interrupted))).toBe(true);
    expect(await record('eeeeeeeeeee')).toMatchObject({
      state: 'stopped',
      step: 'transcribe',
      done: ['info', 'download', 'audio'],
    });
    expect(texts(await events('eeeeeeeeeee')).at(-1)).toBe(
      'stop: stopped during transcribe (42%)',
    );
  });

  it('records stopped when its run is interrupted, as SIGTERM does', async () => {
    await add('fffffffffff');
    const fiber = Effect.runFork(
      work(
        'fffffffffff',
        pipeline((step) => (step === 'download' ? Effect.never : Effect.void)),
      ),
    );
    await vi.waitFor(async () =>
      expect((await record('fffffffffff')).step).toBe('download'),
    );
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect((await record('fffffffffff')).state).toBe('stopped');
    expect(texts(await events('fffffffffff')).at(-1)).toBe(
      'stop: stopped during download',
    );
  });

  it('exits at once when another worker runs the same Video', async () => {
    await add('ggggggggggg');
    const first = Effect.runFork(
      work(
        'ggggggggggg',
        pipeline(() => Effect.never),
      ),
    );
    await vi.waitFor(async () =>
      expect((await record('ggggggggggg')).state).toBe('running'),
    );
    expect(
      await Effect.runPromise(
        work(
          'ggggggggggg',
          pipeline(() => Effect.void),
        ),
      ),
    ).toBe('already');
    await Effect.runPromise(Fiber.interrupt(first));
  });

  it('waits while another Video is at work, saying which, then runs', async () => {
    await add('hhhhhhhhhhh');
    await add('iiiiiiiiiii');
    const release = Effect.runSync(Deferred.make<void>());
    const first = Effect.runFork(
      work(
        'hhhhhhhhhhh',
        pipeline((step) =>
          step === 'info' ? Deferred.await(release) : Effect.void,
        ),
      ),
    );
    await vi.waitFor(async () =>
      expect((await record('hhhhhhhhhhh')).state).toBe('running'),
    );
    const second = Effect.runFork(
      work(
        'iiiiiiiiiii',
        pipeline(() => Effect.void),
      ),
    );
    await vi.waitFor(async () =>
      expect(texts(await events('iiiiiiiiiii'))).toEqual([
        'check: waiting for hhhhhhhhhhh to finish',
      ]),
    );
    expect((await record('iiiiiiiiiii')).state).toBe('queued');
    await Effect.runPromise(Deferred.succeed(release, undefined));
    expect(await Effect.runPromise(Fiber.join(first))).toBe('done');
    expect(await Effect.runPromise(Fiber.join(second))).toBe('done');
  }, 15_000);
});
