import { describe, expect, it } from 'vitest';
import type { Video } from '../../../../video/library/schema.ts';
import {
  currentOf,
  lengthsOf,
  marksOf,
  shorterOf,
  statusOf,
} from '../status.ts';

const video = (fields: Partial<Video>): Video => ({
  id: 'Xk3pTq9LmZw',
  url: 'https://youtu.be/Xk3pTq9LmZw',
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
  files: {
    folder: '/v',
    video: '/v/video.mp4',
    transcript: '/v/transcript.md',
    transcriptFull: '/v/transcript-full.md',
    transcriptJson: '/v/transcript.json',
    summary: '/v/summary.md',
    summaryJson: '/v/summary.json',
    cuts: '/v/cuts.json',
    original: '/v/work/original.mp4',
  },
  createdAt: '2026-11-25T09:00:00.000Z',
  updatedAt: '2026-11-25T09:00:00.000Z',
  ...fields,
});

describe('statusOf', () => {
  it('says the step and its percent while running', () => {
    expect(
      statusOf(video({ state: 'running', step: 'transcribe', progress: 0.42 })),
    ).toBe('transcribe 42%');
    expect(statusOf(video({ state: 'running', step: 'clean-up' }))).toBe(
      'clean-up',
    );
  });

  it('says where it failed or stopped', () => {
    expect(
      statusOf(
        video({
          state: 'failed',
          step: 'download',
          error: { step: 'download', message: '403' },
        }),
      ),
    ).toBe('failed at download');
    expect(
      statusOf(video({ state: 'stopped', step: 'transcribe', progress: 0.67 })),
    ).toBe('stopped at transcribe 67%');
    expect(statusOf(video({ state: 'queued' }))).toBe('queued');
    expect(statusOf(video({ state: 'done' }))).toBe('done');
  });
});

describe('lengthsOf and shorterOf', () => {
  it('give the original length, then old → new once done', () => {
    expect(lengthsOf(video({}))).toBeNull();
    expect(lengthsOf(video({ duration: 1834 }))).toBe('30:34');
    const done = video({
      duration: 60,
      result: {
        duration: 39.4,
        cuts: 5,
        removed: { silence: 3.5, fillers: 0.6, ads: 10, fillerTalk: 3 },
      },
    });
    expect(lengthsOf(done)).toBe('1:00 → 0:39');
    expect(shorterOf(done)).toBe('34% shorter');
  });
});

describe('marksOf', () => {
  it('marks steps done, the one under way, and the rest pending', () => {
    const marks = marksOf(
      video({ state: 'running', step: 'audio', done: ['info', 'download'] }),
    );
    expect(marks.slice(0, 4).map(({ mark }) => mark)).toEqual([
      'done',
      'done',
      'running',
      'pending',
    ]);
    expect(marksOf(video({ state: 'failed', step: 'info' }))[0]?.mark).toBe(
      'failed',
    );
  });
});

describe('currentOf', () => {
  it('names the step under way, stopped or failed, with its place', () => {
    expect(
      currentOf(
        video({ state: 'running', step: 'audio', done: ['info', 'download'] }),
      ),
    ).toEqual({
      step: 'audio',
      mark: 'running',
      place: 3,
      of: 8,
    });
    expect(
      currentOf(video({ state: 'failed', step: 'download', done: ['info'] })),
    ).toMatchObject({
      step: 'download',
      mark: 'failed',
      place: 2,
    });
  });

  it('names the first step not done while queued, and the last when all are', () => {
    expect(currentOf(video({ state: 'queued' }))).toMatchObject({
      step: 'info',
      mark: 'pending',
      place: 1,
    });
    expect(
      currentOf(
        video({
          state: 'done',
          done: [
            'info',
            'download',
            'audio',
            'transcribe',
            'clean-up',
            'render',
            'transcripts',
            'summary',
          ],
        }),
      ),
    ).toMatchObject({ step: 'summary', mark: 'done', place: 8 });
  });
});
