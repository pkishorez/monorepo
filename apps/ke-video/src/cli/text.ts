import { type Event, STEPS, type Video } from '../video/library/index.ts';
import type { Requirement } from '../video/worker/index.ts';

/*
 * What the commands print for people: the list's table, one Video's
 * status, Events as log lines, the missing requirements, sizes.
 */

/** `seconds` as H:MM:SS, or M:SS under an hour. */
export const duration = (seconds: number) => {
  const whole = Math.round(seconds);
  const [h, m, s] = [
    Math.floor(whole / 3600),
    Math.floor((whole % 3600) / 60),
    whole % 60,
  ];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const percent = (progress: number) => `${Math.floor(progress * 100)}%`;

const cut = (text: string, most: number) =>
  text.length > most ? `${text.slice(0, most - 1)}…` : text;

/** `bytes` as people read them: 1.4 GB. */
export const size = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const shown =
    unit === 0 ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  return `${shown} ${units[unit]}`;
};

/** How long before `now` the time `at` was: 8 min ago. */
export const ago = (at: string, now: Date) => {
  const seconds = Math.max(0, (now.getTime() - Date.parse(at)) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} days ago`;
};

const titleOf = (video: Video) => video.title ?? '(waiting for info)';

/** The Video's length: old → new once done. */
const lengthOf = (video: Video) =>
  video.duration === null
    ? '–'
    : video.result === null
      ? duration(video.duration)
      : `${duration(video.duration)} → ${duration(video.result.duration)}`;

const resumeLine = (id: string) => `ke-video resume ${id}`;

/** Where the Video stands, in a few words. */
const standing = (video: Video) => {
  switch (video.state) {
    case 'done':
      return 'done';
    case 'queued':
      return 'queued';
    case 'running':
      return video.step === null
        ? 'running'
        : `${video.step}${video.progress === null ? '' : ` ${percent(video.progress)}`}`;
    case 'stopped':
      return `stopped${video.step === null ? '' : ` at ${video.step}`}: ${resumeLine(video.id)}`;
    case 'failed':
      return `failed at ${video.error?.step ?? video.step ?? 'start'}: ${resumeLine(video.id)}`;
  }
};

/** Every Video, one per line under a header, or how to add the first. */
export const table = (videos: ReadonlyArray<Video>) => {
  if (videos.length === 0)
    return 'No videos yet. Add one with: ke-video create <youtube link>\n';
  const rows = [
    ['ID', 'TITLE', 'LENGTH', 'STATUS'],
    ...videos.map((video) => [
      video.id,
      cut(titleOf(video), 40),
      lengthOf(video),
      standing(video),
    ]),
  ];
  const widths = [0, 1, 2].map((column) =>
    Math.max(...rows.map((row) => row[column]!.length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column < 3 ? cell.padEnd(widths[column]!) : cell,
        )
        .join('   '),
    )
    .map((line) => `${line.trimEnd()}\n`)
    .join('');
};

/** The steps, each marked done, running, failed or still to do. */
const stepsLine = (video: Video) =>
  STEPS.map((step) => {
    if (video.done.includes(step)) return `✓ ${step}`;
    if (step !== video.step) return `· ${step}`;
    const progress =
      video.progress === null ? '' : ` ${percent(video.progress)}`;
    if (video.state === 'running') return `▸ ${step}${progress}`;
    if (video.state === 'failed') return `✗ ${step}`;
    return `· ${step}${progress}`;
  }).join('  ');

/**
 * One Video: its title, length, strength and standing, its steps, its
 * latest line, and its files once done, or what went wrong. `started` is
 * when its worker last started.
 */
export const status = (video: Video, started: string | null, now: Date) => {
  const state =
    video.state === 'running' && started !== null
      ? `running, started ${ago(started, now)}`
      : video.state === 'stopped' && video.step !== null
        ? `stopped at ${video.step}`
        : video.state === 'failed'
          ? `failed at ${video.error?.step ?? video.step ?? 'start'}`
          : video.state;
  const length =
    video.result !== null && video.duration !== null && video.duration > 0
      ? `${lengthOf(video)} (${Math.round((1 - video.result.duration / video.duration) * 100)}% shorter)`
      : lengthOf(video);
  const lines = [
    [titleOf(video), length, video.strength, state].join(' · '),
    `  ${stepsLine(video)}`,
  ];
  if (video.state === 'done') {
    if (video.result !== null) {
      const { silence, fillers, ads, fillerTalk } = video.result.removed;
      lines.push(
        `  removed: silence ${duration(silence)}, fillers ${duration(fillers)}, ads ${duration(ads)}, filler talk ${duration(fillerTalk)} (${video.result.cuts} cuts)`,
      );
    }
    const files = [
      ['video', video.files.video],
      ['transcript', video.files.transcript],
      ['full', video.files.transcriptFull],
      ['summary', video.files.summary],
      ['cuts', video.files.cuts],
    ];
    lines.push(...files.map(([name, path]) => `  ${name!.padEnd(12)}${path}`));
  } else if (video.state !== 'failed' && video.latest !== null)
    lines.push(`  latest: ${cut(video.latest, 100)}`);
  if (video.state === 'failed' && video.error !== null)
    lines.push(`  error: ${video.error.message}`);
  if (video.state === 'failed' || video.state === 'stopped')
    lines.push(`  Resume it with: ${resumeLine(video.id)}`);
  return lines.map((line) => `${line}\n`).join('');
};

/** The local time of `at` as HH:MM:SS. */
const clockOf = (at: string) => {
  const time = new Date(at);
  return [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
};

/** One Event as a log line, without its line end. */
export const eventLine = (event: Event) => {
  const what =
    event.text ?? (event.progress === undefined ? '' : percent(event.progress));
  return `${clockOf(event.at)}  ${(event.label ?? event.step).padEnd(12)}  ${what}`.trimEnd();
};

const isProgressOnly = (event: Event) =>
  event.text === undefined && event.progress !== undefined;

/** What a printer of Events writes: each Event's text, then what ends the output. */
export interface Printer {
  readonly event: (event: Event) => string;
  readonly end: () => string;
}

/**
 * Prints Events as log lines. On a terminal (`tty`), consecutive
 * progress-only Events of one step rewrite one line in place; otherwise
 * only each 5% step forward and 100% print.
 */
export const printer = (tty: boolean): Printer => {
  let open: string | null = null;
  const shown = new Map<string, number>();
  return {
    event: (event) => {
      const key = `${event.step}/${event.label ?? ''}`;
      if (!isProgressOnly(event)) {
        const before = open === null ? '' : '\n';
        open = null;
        return `${before}${eventLine(event)}\n`;
      }
      if (tty) {
        const before = open === null ? '' : open === key ? '\r\x1b[2K' : '\n';
        open = key;
        return `${before}${eventLine(event)}`;
      }
      const progress = event.progress ?? 0;
      const fives = progress >= 1 ? 20 : Math.floor(progress * 20);
      const last = shown.get(key) ?? 0;
      shown.set(key, fives);
      return fives > last ? `${eventLine(event)}\n` : '';
    },
    end: () => (open === null ? '' : '\n'),
  };
};

/** The requirements, each found or with its install line, when one is missing. */
export const missing = (requirements: ReadonlyArray<Requirement>) => {
  const width = Math.max(...requirements.map(({ name }) => name.length));
  return [
    'ke-video needs these first:',
    ...requirements.map(({ name, ok, install }) =>
      ok ? `  ✓ ${name}` : `  ✗ ${name.padEnd(width)}   ${install}`,
    ),
    'Install them, then run the same command again.',
  ].join('\n');
};
