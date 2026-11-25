import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Event, Video } from '../../video/library/index.ts';

/*
 * `ke-video` end to end, each command its own process as a user runs it,
 * in a library of its own per test, its workers running the fake pipeline:
 * `hold-<step>` in the library keeps that step waiting.
 */

const BIN = fileURLToPath(
  new URL('../../../bin/ke-video.mjs', import.meta.url),
);
const FAKE = fileURLToPath(
  new URL('../../video/worker/tests/fake-pipeline.ts', import.meta.url),
);

interface Ran {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const homes: Array<string> = [];

afterAll(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true });
});

const library = () => {
  // Short, for a socket path is at most 103 bytes.
  const home = mkdtempSync(
    join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'kv-'),
  );
  homes.push(home);
  const env = {
    ...process.env,
    KE_VIDEO_HOME: home,
    XDG_RUNTIME_DIR: join(home, 'run'),
    KE_VIDEO_PIPELINE: FAKE,
  };
  const keVideo = (...args: ReadonlyArray<string>) =>
    new Promise<Ran>((resolve, reject) => {
      const child = spawn(process.execPath, [BIN, ...args], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk));
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
  const status = async (id: string) =>
    JSON.parse((await keVideo('status', id, '--json')).stdout) as Video;
  /** Waits until the Video waits in `step`, held at 50%. */
  const held = (id: string, step: string) =>
    vi.waitFor(async () =>
      expect(await status(id)).toMatchObject({
        state: 'running',
        step,
        progress: 0.5,
      }),
    );
  return {
    home,
    keVideo,
    status,
    held,
    hold: (step: string) => writeFileSync(join(home, `hold-${step}`), ''),
    release: (step: string) => rmSync(join(home, `hold-${step}`)),
  };
};

const ID = 'dQw4w9WgXcQ';
const LINK = `https://www.youtube.com/watch?v=${ID}&t=42s`;

describe('ke-video', () => {
  it('creates a Video whose worker runs, streams its log until done, and lists it', async () => {
    const { keVideo, status, held, hold, release } = library();
    hold('transcribe');
    const created = await keVideo('create', LINK);
    expect(created).toMatchObject({ code: 0, stderr: '' });
    expect(created.stdout).toBe(
      `Added ${ID} (normal). Its worker has started.\nFollow it with: ke-video logs ${ID} -f\n`,
    );
    await held(ID, 'transcribe');
    const listed = await keVideo('list');
    expect(listed.stdout).toMatch(
      new RegExp(`${ID}\\s+A fake talk\\s+10:00\\s+transcribe 50%`),
    );
    const following = keVideo('logs', ID, '-f');
    await vi.waitFor(async () =>
      expect((await keVideo('logs', ID)).stdout).toContain('transcribe begins'),
    );
    release('transcribe');
    const followed = await following;
    expect(followed.code).toBe(0);
    const lines = followed.stdout.trimEnd().split('\n');
    expect(lines[0]).toMatch(
      /^\d\d:\d\d:\d\d {2}create {6} {2}added https:\/\/www\.youtube\.com/,
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/ {2}transcribe {4}100%$/),
    );
    expect(lines.at(-1)).toMatch(
      / {2}done {8} {2}10:00 → 5:30 \(45% shorter\)$/,
    );
    expect(await status(ID)).toMatchObject({
      state: 'done',
      done: expect.arrayContaining(['summary']),
    });
    expect((await keVideo('list')).stdout).toMatch(
      new RegExp(`${ID}\\s+A fake talk\\s+10:00 → 5:30\\s+done`),
    );
    const json = (await keVideo('logs', ID, '--json')).stdout
      .trimEnd()
      .split('\n');
    expect((JSON.parse(json.at(-1)!) as Event).step).toBe('done');
  }, 60_000);

  it('stops a running Video, refuses to resume it while it runs, and resumes it at the step it stopped in', async () => {
    const { keVideo, status, held, hold, release } = library();
    hold('transcribe');
    await keVideo('create', LINK, '--strength', 'heavy');
    await held(ID, 'transcribe');
    const refused = await keVideo('resume', ID);
    expect(refused).toMatchObject({
      code: 1,
      stdout: '',
      stderr: `${ID} is already running. Stop it first: ke-video stop ${ID}\n`,
    });
    const stopped = await keVideo('stop', ID);
    expect(stopped.code).toBe(0);
    expect(stopped.stdout).toContain(`Stopped ${ID} during transcribe (50%).`);
    expect(await status(ID)).toMatchObject({
      state: 'stopped',
      step: 'transcribe',
      done: ['info', 'download', 'audio'],
      latest: 'stopped during transcribe (50%)',
    });
    release('transcribe');
    const resumed = await keVideo('resume', ID);
    expect(resumed.code).toBe(0);
    expect(resumed.stdout).toContain(`Resumed ${ID} from transcribe.`);
    await vi.waitFor(
      async () => expect((await status(ID)).state).toBe('done'),
      { timeout: 20_000 },
    );
    const begun = (await keVideo('logs', ID)).stdout
      .split('\n')
      .filter((line) => line.endsWith('begins'))
      .map((line) => line.split(/\s+/)[1]);
    expect(begun).toEqual([
      'info',
      'download',
      'audio',
      'transcribe',
      'transcribe',
      'clean-up',
      'render',
      'transcripts',
      'summary',
    ]);
    expect((await status(ID)).strength).toBe('heavy');
  }, 60_000);

  it('refuses a second create of one id, and deletes a Video with its folder', async () => {
    const { home, keVideo, status } = library();
    await keVideo('create', `https://youtu.be/${ID}`);
    const again = await keVideo('create', LINK);
    expect(again).toMatchObject({
      code: 1,
      stderr: `${ID} already exists: resume it with ke-video resume ${ID}, or remove it with ke-video delete ${ID}\n`,
    });
    await vi.waitFor(
      async () => expect((await status(ID)).state).toBe('done'),
      { timeout: 20_000 },
    );
    const deleted = await keVideo('delete', ID);
    expect(deleted.code).toBe(0);
    expect(deleted.stdout).toMatch(
      /^Deleted A fake talk \(\d+(\.\d)? KB freed\)\.\n$/,
    );
    expect(existsSync(join(home, 'videos', ID))).toBe(false);
    expect((await keVideo('status', ID)).stderr).toBe(
      `No video ${ID}. See them with: ke-video list\n`,
    );
  }, 60_000);

  it('deletes a Video while its worker runs, stopping it first', async () => {
    const { home, keVideo, held, hold } = library();
    hold('download');
    await keVideo('create', LINK);
    await held(ID, 'download');
    const deleted = await keVideo('delete', ID, '--json');
    expect(deleted.code).toBe(0);
    expect(JSON.parse(deleted.stdout)).toMatchObject({
      id: ID,
      freed: expect.any(Number),
    });
    expect(existsSync(join(home, 'videos', ID))).toBe(false);
  }, 60_000);

  it('refuses to create while a requirement is missing, saying how to install it', async () => {
    const { home, keVideo } = library();
    const { code, stderr } = await new Promise<Ran>((resolve) => {
      const child = spawn(process.execPath, [BIN, 'create', LINK], {
        env: {
          ...process.env,
          KE_VIDEO_HOME: home,
          XDG_RUNTIME_DIR: join(home, 'run'),
          KE_VIDEO_PIPELINE: FAKE,
          KE_VIDEO_FAKE_MISSING: 'yt-dlp',
        },
      });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
      child.once('close', (code) => resolve({ code, stdout: '', stderr }));
    });
    expect(code).toBe(1);
    expect(stderr).toContain('  ✗ yt-dlp    brew install yt-dlp\n');
    expect(stderr).toContain('Install them, then run the same command again.');
    expect((await keVideo('list', '--json')).stdout.trim()).toBe('[]');
  }, 30_000);
});
