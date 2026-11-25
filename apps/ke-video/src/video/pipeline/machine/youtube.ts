import { join } from 'node:path';

/** The best mp4 up to 1080p with its m4a sound, else the best single file up to 1080p, else the best there is. */
export const FORMAT =
  'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b';

/** yt-dlp's arguments for a video's details, for the format it would download. */
export const infoArgs = (url: string): ReadonlyArray<string> => [
  '-J',
  '--no-playlist',
  '--no-warnings',
  '-f',
  FORMAT,
  url,
];

/** yt-dlp's arguments for downloading a video into `work/original.mp4`. */
export const downloadArgs = (
  url: string,
  work: string,
): ReadonlyArray<string> => [
  '-f',
  FORMAT,
  '--merge-output-format',
  'mp4',
  '--remux-video',
  'mp4',
  '--newline',
  '--no-playlist',
  '--no-mtime',
  '-o',
  join(work, 'original.%(ext)s'),
  url,
];

/** What ke-video keeps of a video's details. */
export interface Info {
  readonly id: string;
  readonly title: string;
  readonly channel: string;
  readonly duration: number;
  readonly description: string;
  readonly chapters: ReadonlyArray<{
    readonly title: string;
    readonly start: number;
    readonly end: number;
  }>;
  /** Live now or not yet started: nothing to download. */
  readonly live: boolean;
  readonly height: number | null;
  /** Bytes of each file downloaded, in order, when yt-dlp knows them. */
  readonly parts: ReadonlyArray<number | null>;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown) => (typeof value === 'string' ? value : null);
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Bytes of a file of `kbps` over `seconds`, when both are known. */
const bitrateSize = (kbps: number | null, seconds: number | null) =>
  kbps === null || seconds === null ? null : Math.round(kbps * 125 * seconds);

/** The details ke-video keeps from what `yt-dlp -J` printed. */
export const readInfo = (json: unknown): Info => {
  const info = record(json);
  const formats = Array.isArray(info.requested_formats)
    ? info.requested_formats.map(record)
    : [info];
  const chapters = Array.isArray(info.chapters)
    ? info.chapters.map(record)
    : [];
  return {
    id: text(info.id) ?? '',
    title: text(info.title) ?? text(info.fulltitle) ?? 'Untitled',
    channel: text(info.channel) ?? text(info.uploader) ?? 'Unknown channel',
    duration: number(info.duration) ?? 0,
    description: text(info.description) ?? '',
    chapters: chapters.map((chapter) => ({
      title: text(chapter.title) ?? '',
      start: number(chapter.start_time) ?? 0,
      end: number(chapter.end_time) ?? 0,
    })),
    live: info.is_live === true || info.live_status === 'is_upcoming',
    height:
      number(info.height) ??
      formats.map((f) => number(f.height)).find((h) => h !== null) ??
      null,
    parts: formats.map(
      (f) =>
        number(f.filesize) ??
        number(f.filesize_approx) ??
        bitrateSize(number(f.tbr), number(info.duration)),
    ),
  };
};

/** One line of yt-dlp's download output, as far as progress goes. */
export type DownloadLine =
  | { readonly _tag: 'Part' }
  | { readonly _tag: 'Percent'; readonly percent: number }
  | { readonly _tag: 'Other' };

/**
 * Reads one `--newline` line of yt-dlp: a new file starting, or how far one
 * is. A download in fragments goes by fragments: its percent is a guess
 * that jumps about.
 */
export const downloadLine = (line: string): DownloadLine => {
  if (line.startsWith('[download] Destination: ')) return { _tag: 'Part' };
  if (/^\[download\] .* has already been downloaded/.test(line))
    return { _tag: 'Part' };
  const percent = /^\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)?.[1];
  if (percent === undefined) return { _tag: 'Other' };
  const fragments = /\(frag (\d+)\/(\d+)\)/.exec(line);
  return fragments === null || Number(fragments[2]) === 0
    ? { _tag: 'Percent', percent: Number(percent) / 100 }
    : { _tag: 'Percent', percent: Number(fragments[1]) / Number(fragments[2]) };
};

/**
 * How far the whole download is, 0..1, with `part` (from 0) at `percent`:
 * each file weighed by its size when every size is known, else equally.
 */
export const downloaded = (
  parts: ReadonlyArray<number | null>,
  part: number,
  percent: number,
): number => {
  if (parts.length === 0) return Math.min(1, percent);
  const count = parts.length;
  const at = Math.min(part, count - 1);
  const sizes = parts.every((p): p is number => p !== null && p > 0)
    ? parts
    : Array.from({ length: count }, () => 1);
  const total = sizes.reduce((sum, s) => sum + s, 0);
  const before = sizes.slice(0, at).reduce((sum, s) => sum + s, 0);
  return Math.min(1, (before + percent * sizes[at]!) / total);
};

const CHANGED = [
  /sign in to confirm/i,
  /unable to extract/i,
  /nsig|signature/i,
  /http error 403/i,
  /requested format is not available/i,
  /player/i,
  /please report this issue/i,
];

/**
 * A plain message for yt-dlp failing at `doing`: its last error lines, and
 * `brew upgrade yt-dlp` when YouTube looks to have changed.
 */
export const youtubeFailure = (
  doing: string,
  tail: ReadonlyArray<string>,
): string => {
  const errors = tail.filter((line) => line.startsWith('ERROR:'));
  const shown = (errors.length > 0 ? errors : tail).slice(-3).join('\n');
  const changed = CHANGED.some((pattern) => pattern.test(shown));
  return [
    `yt-dlp could not ${doing}.`,
    shown === '' ? null : shown,
    changed
      ? 'YouTube may have changed: update yt-dlp with `brew upgrade yt-dlp`, then resume.'
      : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
};
