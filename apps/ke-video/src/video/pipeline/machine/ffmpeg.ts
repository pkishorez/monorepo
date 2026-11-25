import { Effect } from 'effect';
import type { Range } from '../../library/index.ts';
import { capture, Failed } from './process.ts';

/** What ffprobe says of a video file, on the timeline ffmpeg's filters see. */
export interface Probe {
  /** Seconds of the whole file. */
  readonly duration: number;
  readonly fps: number;
  /** Where the first frame is, in seconds. */
  readonly videoStart: number;
  /** Where the first sample is, in seconds. */
  readonly audioStart: number;
  /** Bits per second of the picture, when known. */
  readonly bitrate: number | null;
  readonly sampleRate: number;
  readonly channels: number;
  readonly videoDuration: number | null;
  readonly audioDuration: number | null;
}

/** ffprobe's arguments for a file's streams and format, as JSON. */
export const probeArgs = (file: string): ReadonlyArray<string> => [
  '-v',
  'error',
  '-show_streams',
  '-show_format',
  '-of',
  'json',
  file,
];

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};

const number = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

const rate = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const [top, bottom] = value.split('/').map(Number);
  if (top === undefined || !Number.isFinite(top) || top <= 0) return null;
  const n = bottom === undefined ? top : top / bottom;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The Probe of what `ffprobe -show_streams -show_format -of json` printed. */
export const readProbe = (json: unknown): Probe => {
  const all = record(json);
  const streams = Array.isArray(all.streams) ? all.streams.map(record) : [];
  const format = record(all.format);
  const video = streams.find((s) => s.codec_type === 'video') ?? {};
  const audio = streams.find((s) => s.codec_type === 'audio') ?? {};
  const start = number(format.start_time) ?? 0;
  return {
    duration: number(format.duration) ?? number(video.duration) ?? 0,
    fps: rate(video.avg_frame_rate) ?? rate(video.r_frame_rate) ?? 30,
    videoStart: (number(video.start_time) ?? start) - start,
    audioStart: (number(audio.start_time) ?? start) - start,
    bitrate: number(video.bit_rate),
    sampleRate: number(audio.sample_rate) ?? 48_000,
    channels: Math.min(2, number(audio.channels) ?? 2),
    videoDuration: number(video.duration),
    audioDuration: number(audio.duration),
  };
};

/** Reads `silencedetect`'s lines into silences, one line at a time. */
export const silenceReader = () => {
  const found: Array<Range> = [];
  let open: number | null = null;
  return {
    line: (line: string) => {
      const start = /silence_start: (-?[\d.]+)/.exec(line)?.[1];
      if (start !== undefined) open = Math.max(0, Number(start));
      const end = /silence_end: (-?[\d.]+)/.exec(line)?.[1];
      if (end !== undefined && open !== null) {
        found.push({ start: open, end: Number(end) });
        open = null;
      }
    },
    /** The silences, one still open running to `duration`. */
    done: (duration: number): Array<Range> =>
      open === null || duration <= open
        ? [...found]
        : [...found, { start: open, end: duration }],
  };
};

/** The output time in seconds of one `-progress` line, if it says one. */
export const progressTime = (line: string): number | null => {
  const micro = /^out_time_(?:us|ms)=(\d+)$/.exec(line.trim())?.[1];
  if (micro !== undefined) return Number(micro) / 1e6;
  const clock = /^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)$/.exec(line.trim());
  if (clock === null) return null;
  return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
};

/** How the picture is encoded. */
export type Encoder = 'videotoolbox' | 'x264';

/** Whether `ffmpeg -encoders` lists Apple's hardware H.264 encoder. */
export const listsVideoToolbox = (encoders: string): boolean =>
  /\sh264_videotoolbox\s/.test(encoders);

/** The bitrate the hardware encoder aims at: a little over the original's, within reason. */
const target = (bitrate: number | null) =>
  Math.round(Math.min(16e6, Math.max(1.5e6, (bitrate ?? 4e6) * 1.25)));

/** ffmpeg's arguments for the picture's codec. */
export const encoderArgs = (
  encoder: Encoder,
  bitrate: number | null,
): ReadonlyArray<string> =>
  encoder === 'videotoolbox'
    ? [
        '-c:v',
        'h264_videotoolbox',
        '-b:v',
        String(target(bitrate)),
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
      ]
    : [
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
      ];

/**
 * The `select` filter that keeps frames `[first, end)` of each range, on
 * the grid of `fps` from `origin`, for input that starts at `from`
 * seconds; then frames numbered on without gaps.
 */
export const selectFilter = (
  kept: ReadonlyArray<readonly [number, number]>,
  fps: number,
  origin: number,
  from: number,
): string => {
  const at = (frame: number) =>
    (origin + (frame - 0.5) / fps - from).toFixed(6);
  const terms = kept.map(
    ([first, end]) => `between(t,${at(first)},${at(end)})`,
  );
  return `select='${terms.join('+')}',setpts=N/FRAME_RATE/TB`;
};

/** The Probe of `file`. */
export const probe = (file: string) =>
  Effect.gen(function* () {
    const ran = yield* capture('ffprobe', probeArgs(file));
    if (ran.code !== 0)
      return yield* new Failed({
        message: `ffprobe could not read ${file}: ${ran.tail.slice(-2).join(' ')}`,
      });
    const json = yield* Effect.try({
      try: () => JSON.parse(ran.out) as unknown,
      catch: () =>
        new Failed({ message: `ffprobe printed no JSON for ${file}` }),
    });
    return readProbe(json);
  });

/** The encoder this computer's ffmpeg has: VideoToolbox when listed, else libx264. */
export const encoder = capture('ffmpeg', ['-hide_banner', '-encoders']).pipe(
  Effect.map((ran): Encoder =>
    listsVideoToolbox(ran.out) ? 'videotoolbox' : 'x264',
  ),
);
