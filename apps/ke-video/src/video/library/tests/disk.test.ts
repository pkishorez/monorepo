import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendEvent,
  filesOf,
  listVideos,
  look,
  readEvents,
  readEventsFrom,
  readVideo,
  reconcile,
  removeVideo,
  type Video,
  writeVideo,
} from '../index.ts';

/* A Video's record and log on disk, in a library of its own per test, and how a record with no live worker reads. */

const video = (id: string, changes: Partial<Video> = {}): Video => ({
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

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

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

describe('the record', () => {
  it('reads back what was written, leaving no part file', async () => {
    const written = video('aaaaaaaaaaa', { title: 'A talk', done: ['info'] });
    await run(writeVideo(written));
    expect(await run(readVideo('aaaaaaaaaaa'))).toEqual(written);
    expect(readdirSync(filesOf('aaaaaaaaaaa').folder)).toEqual(['video.json']);
  });

  it('is not found for an unknown id, or one that would leave the library', async () => {
    for (const id of ['nothinghere', '../..', 'a/b'])
      expect((await run(Effect.flip(readVideo(id))))._tag).toBe('NotFound');
  });

  it('says a broken record is broken, and how to remove it', async () => {
    await run(writeVideo(video('bbbbbbbbbbb')));
    appendFileSync(join(filesOf('bbbbbbbbbbb').folder, 'video.json'), '}');
    const error = await run(Effect.flip(readVideo('bbbbbbbbbbb')));
    expect(error.message).toContain('ke-video delete bbbbbbbbbbb');
  });

  it('lists every Video newest first', async () => {
    await run(
      writeVideo(
        video('older000000', { createdAt: '2026-11-01T00:00:00.000Z' }),
      ),
    );
    await run(
      writeVideo(
        video('newer000000', { createdAt: '2026-11-20T00:00:00.000Z' }),
      ),
    );
    const ids = (await run(listVideos)).map(({ id }) => id);
    expect(ids).toEqual(['newer000000', 'older000000']);
  });

  it('removes a Video, saying how many bytes it freed', async () => {
    await run(writeVideo(video('ccccccccccc')));
    const freed = await run(removeVideo('ccccccccccc'));
    expect(freed).toBeGreaterThan(100);
    expect(existsSync(filesOf('ccccccccccc').folder)).toBe(false);
  });
});

describe('reconcile', () => {
  it('reports a queued or running Video with no live worker as stopped', () => {
    for (const state of ['queued', 'running'] as const) {
      expect(reconcile(video('a', { state }), false).state).toBe('stopped');
      expect(reconcile(video('a', { state }), true).state).toBe(state);
    }
  });

  it('keeps every other state as it is', () => {
    for (const state of ['stopped', 'failed', 'done'] as const)
      expect(reconcile(video('a', { state }), false).state).toBe(state);
  });

  it('applies when looking at a Video, without rewriting its record', async () => {
    await run(
      writeVideo(video('ddddddddddd', { state: 'running', step: 'audio' })),
    );
    expect((await run(look('ddddddddddd'))).state).toBe('stopped');
    expect((await run(readVideo('ddddddddddd'))).state).toBe('running');
  });
});

describe('the log', () => {
  it('reads every Event added, in order', async () => {
    await run(writeVideo(video('eeeeeeeeeee')));
    await run(
      appendEvent('eeeeeeeeeee', {
        at: '2026-11-25T10:00:00.000Z',
        step: 'create',
        text: 'added',
      }),
    );
    await run(
      appendEvent('eeeeeeeeeee', {
        at: '2026-11-25T10:00:01.000Z',
        step: 'info',
        progress: 0.5,
      }),
    );
    expect(await run(readEvents('eeeeeeeeeee'))).toEqual([
      { at: '2026-11-25T10:00:00.000Z', step: 'create', text: 'added' },
      { at: '2026-11-25T10:00:01.000Z', step: 'info', progress: 0.5 },
    ]);
  });

  it('leaves a line still being written for the next read', async () => {
    await run(writeVideo(video('fffffffffff')));
    await run(
      appendEvent('fffffffffff', {
        at: '2026-11-25T10:00:00.000Z',
        step: 'create',
      }),
    );
    const log = join(filesOf('fffffffffff').folder, 'log.jsonl');
    appendFileSync(log, '{"at":"2026-11-25T10:00:01.000Z","st');
    const first = await run(readEventsFrom('fffffffffff', 0));
    expect(first.events).toHaveLength(1);
    appendFileSync(log, 'ep":"info"}\n');
    const second = await run(readEventsFrom('fffffffffff', first.offset));
    expect(second.events).toEqual([
      { at: '2026-11-25T10:00:01.000Z', step: 'info' },
    ]);
  });

  it('is empty before anything is logged', async () => {
    expect(await run(readEvents('nothinghere'))).toEqual([]);
  });
});
