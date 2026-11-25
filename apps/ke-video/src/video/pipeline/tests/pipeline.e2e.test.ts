import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import {
  Cuts,
  modelFolder,
  STEPS,
  Summary,
  Transcript,
  type Event,
} from '../../library/index.ts';
import { run, services, type Job } from '../index.ts';

/*
 * The whole pipeline on a real five-minute video with a sponsor read near
 * its end (a Fireship Code Report): downloads it, hears it with Parakeet
 * and asks Claude, so it needs yt-dlp, ffmpeg, a signed-in Claude Code and
 * the network. Runs only with KE_VIDEO_E2E=1, outside `pnpm test`:
 *   KE_VIDEO_E2E=1 pnpm exec vitest run --config src/video/pipeline/tests/e2e.config.ts
 * The speech model is the library's, so it downloads once.
 */

const ID = 'Qxor6jpfSiU';
const SPONSOR = { start: 273, end: 328 };

const enabled = process.env['KE_VIDEO_E2E'] === '1';

describe.skipIf(!enabled)('the pipeline, end to end', () => {
  const made: Array<string> = [];
  afterAll(() =>
    Promise.all(
      made.map((folder) => rm(folder, { recursive: true, force: true })),
    ),
  );

  it('turns a link into a short video without its sponsor read, transcripts and a summary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ke-video-e2e-'));
    made.push(root);
    const folder = join(root, ID);
    await cp(
      join(import.meta.dirname, '../../../../skill'),
      join(root, 'skill'),
      { recursive: true },
    );
    const events: Array<Omit<Event, 'at'>> = [];
    const results: Array<unknown> = [];
    const job: Job = {
      id: ID,
      url: `https://www.youtube.com/watch?v=${ID}`,
      strength: 'normal',
      files: {
        folder,
        video: join(folder, 'video.mp4'),
        transcript: join(folder, 'transcript.md'),
        transcriptFull: join(folder, 'transcript-full.md'),
        transcriptJson: join(folder, 'transcript.json'),
        summary: join(folder, 'summary.md'),
        summaryJson: join(folder, 'summary.json'),
        cuts: join(folder, 'cuts.json'),
        original: join(folder, 'work', 'original.mp4'),
      },
      skill: join(root, 'skill'),
      model: modelFolder(),
      emit: (event) => Effect.sync(() => void events.push(event)),
      update: (patch) => Effect.sync(() => void results.push(patch)),
    };

    await Effect.runPromise(
      Effect.forEach(STEPS, (step) => run(step, job), { discard: true }).pipe(
        Effect.provide(services),
      ),
    );

    for (const file of Object.values(job.files))
      expect((await stat(file)).size).toBeGreaterThan(0);
    const json = async (file: string) =>
      JSON.parse(await readFile(file, 'utf8')) as unknown;
    const cuts = Schema.decodeUnknownSync(Cuts)(await json(job.files.cuts));
    const transcript = Schema.decodeUnknownSync(Transcript)(
      await json(job.files.transcriptJson),
    );
    const summary = Schema.decodeUnknownSync(Summary)(
      await json(job.files.summaryJson),
    );

    const ads = cuts.removed.filter((cut) => cut.kind === 'ad');
    const covered = ads.reduce(
      (sum, cut) =>
        sum +
        Math.max(
          0,
          Math.min(cut.end, SPONSOR.end) - Math.max(cut.start, SPONSOR.start),
        ),
      0,
    );
    expect(covered / (SPONSOR.end - SPONSOR.start)).toBeGreaterThan(0.8);

    const kept = cuts.kept.reduce(
      (sum, range) => sum + range.end - range.start,
      0,
    );
    const last = transcript.trimmed[transcript.trimmed.length - 1]!;
    expect(last.end).toBeLessThanOrEqual(kept + 0.01);
    expect(transcript.full.length).toBeGreaterThan(transcript.trimmed.length);
    expect(summary.chapters.length).toBeGreaterThan(0);
    expect(summary.points.every((point) => point.at <= kept)).toBe(true);

    expect(
      events.some((e) => e.label === 'plan' && /shorter/.test(e.text ?? '')),
    ).toBe(true);
    expect(
      events.some(
        (e) => e.step === 'render' && /length checked/.test(e.text ?? ''),
      ),
    ).toBe(true);
    expect(
      results.some(
        (patch) =>
          typeof patch === 'object' && patch !== null && 'result' in patch,
      ),
    ).toBe(true);
  }, 1_800_000);
});
