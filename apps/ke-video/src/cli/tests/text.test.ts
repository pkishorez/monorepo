import { describe, expect, it } from 'vitest';
import type { Event, Video } from '../../video/library/index.ts';
import * as text from '../text.ts';

/* What people read: the list, a status, log lines and the missing requirements. */

const files = (id: string) => ({
  folder: `/lib/videos/${id}`,
  video: `/lib/videos/${id}/video.mp4`,
  transcript: `/lib/videos/${id}/transcript.md`,
  transcriptFull: `/lib/videos/${id}/transcript-full.md`,
  transcriptJson: `/lib/videos/${id}/transcript.json`,
  summary: `/lib/videos/${id}/summary.md`,
  summaryJson: `/lib/videos/${id}/summary.json`,
  cuts: `/lib/videos/${id}/cuts.json`,
  original: `/lib/videos/${id}/work/original.mp4`,
});

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
  files: files(id),
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
  ...changes,
});

const result = {
  duration: 1865,
  removed: { silence: 600, fillers: 95, ads: 120, fillerTalk: 820 },
  cuts: 311,
};

/** An ISO time that reads as `hh:mm:ss` here. */
const at = (hh: number, mm: number, ss: number) =>
  new Date(2026, 10, 25, hh, mm, ss).toISOString();

describe('duration', () => {
  it('reads as M:SS under an hour and H:MM:SS from one', () => {
    expect(text.duration(0)).toBe('0:00');
    expect(text.duration(750)).toBe('12:30');
    expect(text.duration(3500)).toBe('58:20');
    expect(text.duration(11_560)).toBe('3:12:40');
  });
});

describe('size', () => {
  it('reads in the largest unit under 1000', () => {
    expect(text.size(512)).toBe('512 B');
    expect(text.size(12_000_000)).toBe('12 MB');
    expect(text.size(1_420_000_000)).toBe('1.4 GB');
  });
});

describe('table', () => {
  it('aligns every Video under a header, with its length and standing', () => {
    const output = text.table([
      video('abc12345678', {
        title: 'How Postgres indexes work',
        duration: 3500,
        state: 'done',
        result,
        done: ['info'],
      }),
      video('xyz78901234', {
        title: 'Lex Fridman #512',
        duration: 11_560,
        state: 'running',
        step: 'transcribe',
        progress: 0.423,
      }),
      video('qwe45678901'),
      video('err11111111', {
        title: 'Some talk',
        duration: 750,
        state: 'failed',
        step: 'download',
        error: { step: 'download', message: 'HTTP 403' },
      }),
      video('stp11111111', {
        title: 'Paused',
        duration: 60,
        state: 'stopped',
        step: 'audio',
      }),
    ]);
    expect(output).toBe(
      [
        'ID            TITLE                       LENGTH          STATUS',
        'abc12345678   How Postgres indexes work   58:20 → 31:05   done',
        'xyz78901234   Lex Fridman #512            3:12:40         transcribe 42%',
        'qwe45678901   (waiting for info)          –               queued',
        'err11111111   Some talk                   12:30           failed at download: ke-video resume err11111111',
        'stp11111111   Paused                      1:00            stopped at audio: ke-video resume stp11111111',
        '',
      ].join('\n'),
    );
  });

  it('says how to add the first Video when there is none', () => {
    expect(text.table([])).toContain('ke-video create');
  });

  it('cuts a long title short', () => {
    const output = text.table([
      video('aaaaaaaaaaa', { title: 'x'.repeat(80) }),
    ]);
    expect(output).toContain(`${'x'.repeat(39)}…`);
  });
});

describe('status', () => {
  const now = new Date('2026-11-25T10:08:30.000Z');

  it('shows a running Video: its steps, the running one with its percent, and its latest line', () => {
    const output = text.status(
      video('xyz78901234', {
        title: 'Lex Fridman #512',
        duration: 11_560,
        state: 'running',
        step: 'transcribe',
        progress: 0.42,
        done: ['info', 'download', 'audio'],
        latest: '[01:21:10] So the question is whether…',
      }),
      '2026-11-25T10:00:00.000Z',
      now,
    );
    expect(output).toBe(
      [
        'Lex Fridman #512 · 3:12:40 · normal · running, started 8 min ago',
        '  ✓ info  ✓ download  ✓ audio  ▸ transcribe 42%  · clean-up  · render  · transcripts  · summary',
        '  latest: [01:21:10] So the question is whether…',
        '',
      ].join('\n'),
    );
  });

  it('lists the output files of a done Video', () => {
    const output = text.status(
      video('abc12345678', {
        title: 'Indexes',
        duration: 3500,
        state: 'done',
        result,
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
      null,
      now,
    );
    expect(output).toContain(
      'Indexes · 58:20 → 31:05 (47% shorter) · normal · done',
    );
    expect(output).toContain('/lib/videos/abc12345678/video.mp4');
    expect(output).toContain('/lib/videos/abc12345678/summary.md');
    expect(output).toContain('(311 cuts)');
  });

  it('shows the error of a failed Video and how to resume it', () => {
    const output = text.status(
      video('err11111111', {
        state: 'failed',
        step: 'download',
        done: ['info'],
        error: { step: 'download', message: 'HTTP 403' },
      }),
      null,
      now,
    );
    expect(output).toContain('· failed at download');
    expect(output).toContain('✓ info  ✗ download  · audio');
    expect(output).toContain('  error: HTTP 403');
    expect(output).toContain('  Resume it with: ke-video resume err11111111');
  });
});

describe('eventLine', () => {
  it('prints the time, the label or step padded to 12, then the text or percent', () => {
    const lines = [
      {
        at: at(14, 2, 12),
        step: 'info',
        text: '"Lex Fridman #512", 3:12:40, 14 chapters',
      },
      { at: at(14, 7, 30), step: 'transcribe', progress: 0.42 },
      {
        at: at(14, 9, 1),
        step: 'clean-up',
        label: 'filler talk',
        text: 'cut 00:01:00–00:02:00  a tangent',
      },
    ] satisfies ReadonlyArray<Event>;
    expect(lines.map(text.eventLine)).toEqual([
      '14:02:12  info          "Lex Fridman #512", 3:12:40, 14 chapters',
      '14:07:30  transcribe    42%',
      '14:09:01  filler talk   cut 00:01:00–00:02:00  a tangent',
    ]);
  });
});

describe('printer', () => {
  const progress = (step: Event['step'], value: number): Event => ({
    at: at(14, 0, 0),
    step,
    progress: value,
  });
  const line = (step: Event['step'], words: string): Event => ({
    at: at(14, 0, 0),
    step,
    text: words,
  });

  it('rewrites consecutive progress of one step on one line in a terminal', () => {
    const printer = text.printer(true);
    const output =
      [
        line('download', 'starting'),
        progress('download', 0.01),
        progress('download', 0.02),
        progress('audio', 0.5),
        line('audio', 'silences found'),
      ]
        .map(printer.event)
        .join('') + printer.end();
    expect(output).toBe(
      [
        '14:00:00  download      starting\n',
        '14:00:00  download      1%',
        '\r\x1b[2K14:00:00  download      2%',
        '\n14:00:00  audio         50%',
        '\n14:00:00  audio         silences found\n',
      ].join(''),
    );
  });

  it('ends an open progress line', () => {
    const printer = text.printer(true);
    printer.event(progress('render', 0.3));
    expect(printer.end()).toBe('\n');
  });

  it('prints only each 5% forward and 100% when piped', () => {
    const printer = text.printer(false);
    const output = [0, 0.01, 0.04, 0.05, 0.07, 0.12, 0.99, 1]
      .map((value) => printer.event(progress('download', value)))
      .join('');
    expect(
      output
        .split('\n')
        .filter((part) => part !== '')
        .map((part) => part.slice(24)),
    ).toEqual(['5%', '12%', '99%', '100%']);
  });

  it('prints a step run again from its start when piped', () => {
    const printer = text.printer(false);
    const output = [0.5, 0.1, 0.25]
      .map((value) => printer.event(progress('transcribe', value)))
      .join('');
    expect(
      output
        .split('\n')
        .filter((part) => part !== '')
        .map((part) => part.slice(24)),
    ).toEqual(['50%', '25%']);
  });
});

describe('missing', () => {
  it('lists every requirement, with the install line of each missing one', () => {
    expect(
      text.missing([
        { name: 'yt-dlp', ok: false, install: 'brew install yt-dlp' },
        { name: 'ffmpeg', ok: true, install: 'brew install ffmpeg' },
        {
          name: 'claude',
          ok: true,
          install: 'npm install -g @anthropic-ai/claude-code',
        },
      ]),
    ).toBe(
      [
        'ke-video needs these first:',
        '  ✗ yt-dlp   brew install yt-dlp',
        '  ✓ ffmpeg',
        '  ✓ claude',
        'Install them, then run the same command again.',
      ].join('\n'),
    );
  });
});
