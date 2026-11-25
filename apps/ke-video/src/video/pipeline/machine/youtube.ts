import { join } from 'node:path';

/**
 * The best H.264 picture up to 1080p with m4a sound, so the original plays
 * in every browser, iPhone Safari included; else the best mp4 up to 1080p
 * with m4a sound (often VP9), else the best single file up to 1080p, else
 * the best there is. `info` asks with the same format, so its sizes are
 * the download's.
 */
export const FORMAT = [
  'bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]',
  'bv*[height<=1080][ext=mp4]+ba[ext=m4a]',
  'b[height<=1080][ext=mp4]',
  'b',
].join('/');

/** yt-dlp's arguments for a video's details, for the format it would download. */
export const infoArgs = (url: string): ReadonlyArray<string> => [
  '-J',
  '--no-playlist',
  '--no-warnings',
  '-f',
  FORMAT,
  url,
];

/**
 * yt-dlp's arguments for downloading a video into `work/original.mp4`: the
 * formats `info` picked (`format`, e.g. `137+140`) so its sizes are the
 * download's, else FORMAT. YouTube's list of formats can differ from one
 * run to the next, so FORMAT stays behind them as the fallback.
 */
export const downloadArgs = (
  url: string,
  work: string,
  format: string | null = null,
): ReadonlyArray<string> => [
  '-f',
  format === null ? FORMAT : `${format}/${FORMAT}`,
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
  /** The formats yt-dlp picked, as `-f` takes them: `137+140`. */
  readonly format?: string | null;
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
    format: text(info.format_id),
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
  | { readonly _tag: 'Part'; readonly file: string; readonly done: boolean }
  | {
      readonly _tag: 'Percent';
      readonly percent: number;
      /** Bytes of the file being downloaded, as yt-dlp knows them so far. */
      readonly bytes: number | null;
    }
  | { readonly _tag: 'Other' };

const UNITS: Readonly<Record<string, number>> = {
  B: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
  TiB: 1024 ** 4,
};

/**
 * Reads one `--newline` line of yt-dlp: a new file starting, or how far one
 * is. A download in fragments goes by fragments: its percent is a guess
 * that jumps about.
 */
export const downloadLine = (line: string): DownloadLine => {
  const destination = /^\[download\] Destination: (.+)$/.exec(line)?.[1];
  if (destination !== undefined)
    return { _tag: 'Part', file: destination, done: false };
  const already = /^\[download\] (.+) has already been downloaded/.exec(
    line,
  )?.[1];
  if (already !== undefined) return { _tag: 'Part', file: already, done: true };
  const percent = /^\[download\]\s+(\d+(?:\.\d+)?)%/.exec(line)?.[1];
  if (percent === undefined) return { _tag: 'Other' };
  const of = /% of\s+~?\s*(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB|TiB)\b/.exec(line);
  const bytes = of === null ? null : Math.round(Number(of[1]) * UNITS[of[2]!]!);
  const fragments = /\(frag (\d+)\/(\d+)\)/.exec(line);
  return {
    _tag: 'Percent',
    percent:
      fragments === null || Number(fragments[2]) === 0
        ? Number(percent) / 100
        : Number(fragments[1]) / Number(fragments[2]),
    bytes,
  };
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

/** What one line of a download says: how far it all is, and a file starting, with its bytes. */
export interface DownloadStep {
  /** 0..1 of the whole download, never going back; null when the line says nothing of it. */
  readonly progress: number | null;
  /** A file that has started: `sound`, `picture` or `video` (both in one), and its bytes when known. */
  readonly started: {
    readonly what: 'sound' | 'picture' | 'video';
    readonly bytes: number | null;
  } | null;
}

/**
 * Follows yt-dlp's `--newline` lines of a download of `estimates.length`
 * files, in order, often the picture then the sound. Each file weighs its
 * bytes: the size yt-dlp prints once the file starts, before that the
 * estimate from `info`. So a wrong estimate cannot hold the progress at
 * 97% while the sound downloads. A file is announced on its first
 * progress line, which says its size.
 */
export const downloadProgress = (estimates: ReadonlyArray<number | null>) => {
  const sizes: Array<number | null> = [...estimates];
  let part = -1;
  let file = '';
  let announced = -1;
  let furthest = 0;
  const whatOf = (name: string) =>
    /\.(m4a|mp3|opus|aac|ogg)$/i.test(name)
      ? ('sound' as const)
      : sizes.length > 1
        ? ('picture' as const)
        : ('video' as const);
  return (text: string): DownloadStep => {
    const line = downloadLine(text);
    if (line._tag === 'Other') return { progress: null, started: null };
    if (line._tag === 'Part') {
      part += 1;
      file = line.file;
      if (part >= sizes.length) sizes.push(null);
      if (!line.done) return { progress: null, started: null };
      furthest = Math.max(furthest, downloaded(sizes, part, 1));
      return { progress: furthest, started: null };
    }
    const at = Math.max(0, part);
    if (at >= sizes.length) sizes.push(null);
    if (line.bytes !== null && line.bytes > 0) sizes[at] = line.bytes;
    furthest = Math.max(furthest, downloaded(sizes, at, line.percent));
    const started =
      announced < at ? { what: whatOf(file), bytes: sizes[at] ?? null } : null;
    announced = Math.max(announced, at);
    return { progress: furthest, started };
  };
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
