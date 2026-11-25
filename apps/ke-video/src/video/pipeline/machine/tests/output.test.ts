import { describe, expect, it } from 'vitest';
import {
  encoderArgs,
  listsVideoToolbox,
  progressTime,
  readProbe,
  selectFilter,
  silenceReader,
} from '../ffmpeg.ts';
import {
  downloadArgs,
  downloaded,
  downloadLine,
  downloadProgress,
  FORMAT,
  readInfo,
  youtubeFailure,
} from '../youtube.ts';

describe('yt-dlp', () => {
  it('reads progress lines', () => {
    expect(
      downloadLine('[download] Destination: work/original.f137.mp4'),
    ).toEqual({ _tag: 'Part', file: 'work/original.f137.mp4', done: false });
    expect(
      downloadLine(
        '[download] work/original.f140.m4a has already been downloaded',
      ),
    ).toEqual({ _tag: 'Part', file: 'work/original.f140.m4a', done: true });
    expect(
      downloadLine('[download]  45.3% of ~  2.10GiB at  3.20MiB/s ETA 00:31'),
    ).toEqual({
      _tag: 'Percent',
      percent: expect.closeTo(0.453),
      bytes: Math.round(2.1 * 1024 ** 3),
    });
    expect(
      downloadLine(
        '[download]  10.1% of ~ 115.87MiB at 7.58MiB/s ETA 00:08 (frag 13/65)',
      ),
    ).toEqual({
      _tag: 'Percent',
      percent: 0.2,
      bytes: Math.round(115.87 * 1024 ** 2),
    });
    expect(
      downloadLine('[download] 100% of  12.00MiB in 00:00:03 at 3.51MiB/s'),
    ).toEqual({
      _tag: 'Percent',
      percent: 1,
      bytes: 12 * 1024 ** 2,
    });
    expect(
      downloadLine(
        '[download]   0.2% of  422.93KiB at  Unknown B/s ETA Unknown',
      ),
    ).toMatchObject({ bytes: Math.round(422.93 * 1024) });
    expect(
      downloadLine('[Merger] Merging formats into "work/original.mp4"'),
    ).toEqual({ _tag: 'Other' });
  });

  it('weighs each file by its size when known, else equally', () => {
    expect(downloaded([900, 100], 0, 0.5)).toBeCloseTo(0.45);
    expect(downloaded([900, 100], 1, 0.5)).toBeCloseTo(0.95);
    expect(downloaded([null, 100], 1, 0)).toBeCloseTo(0.5);
    expect(downloaded([], 0, 0.3)).toBeCloseTo(0.3);
  });

  it('follows a download of picture then sound by the sizes yt-dlp prints, whatever info guessed', () => {
    // EbrjgWnOfX4: info guessed 2.3 GB of picture; yt-dlp fetched 265 MiB
    // of AV1 in fragments, then 99 MiB of sound, slowly.
    const follow = downloadProgress([2_331_280_000, 115_920_000]);
    const run = (lines: ReadonlyArray<string>) => lines.map(follow);
    const [, , picture, half, pictureDone] = run([
      '[info] EbrjgWnOfX4: Downloading 1 format(s): 399+140',
      '[download] Destination: /v/work/original.f399.mp4',
      '[download]   0.0% of ~ 265.41MiB at  Unknown B/s ETA Unknown (frag 0/1288)',
      '[download]  50.2% of ~ 265.41MiB at   12.31MiB/s ETA 00:10 (frag 644/1288)',
      '[download] 100% of  265.42MiB in 00:00:21 at 12.25MiB/s',
    ]);
    expect(picture).toEqual({
      progress: 0,
      started: { what: 'picture', bytes: Math.round(265.41 * 1024 ** 2) },
    });
    expect(half!.started).toBeNull();
    expect(half!.progress).toBeCloseTo((0.5 * 265.41) / (265.41 + 110.55), 2);
    expect(pictureDone!.progress).toBeCloseTo(0.706, 2);
    const [, sound, , soundHalf, all, merging] = run([
      '[download] Destination: /v/work/original.f140.m4a',
      '[download]   0.0% of   99.40MiB at  176.21KiB/s ETA 09:37',
      '[download]  25.0% of   99.40MiB at  176.21KiB/s ETA 07:13',
      '[download]  50.0% of   99.40MiB at  175.90KiB/s ETA 04:49',
      '[download] 100% of   99.40MiB in 00:09:38 at 176.02KiB/s',
      '[Merger] Merging formats into "/v/work/original.mp4"',
    ]);
    expect(sound).toEqual({
      progress: expect.closeTo(0.7275, 3),
      started: { what: 'sound', bytes: Math.round(99.4 * 1024 ** 2) },
    });
    // The sound counts for its share: no sitting at 97% while it comes.
    expect(soundHalf!.progress).toBeCloseTo(
      (265.42 + 0.5 * 99.4) / (265.42 + 99.4),
      3,
    );
    expect(all!.progress).toBe(1);
    expect(merging).toEqual({ progress: null, started: null });
  });

  it('follows a single file, and counts a file already downloaded as done', () => {
    const follow = downloadProgress([null]);
    expect(
      follow('[download] Destination: w/original.mp4').progress,
    ).toBeNull();
    expect(
      follow('[download]  40.0% of  10.00MiB at  1.00MiB/s ETA 00:06'),
    ).toEqual({
      progress: 0.4,
      started: { what: 'video', bytes: 10 * 1024 ** 2 },
    });
    const again = downloadProgress([800, 200]);
    expect(
      again('[download] w/original.f137.mp4 has already been downloaded')
        .progress,
    ).toBeCloseTo(0.8);
  });

  it('downloads the formats info picked, with the format as the fallback', () => {
    expect(downloadArgs('u', 'w', '137+140').slice(0, 2)).toEqual([
      '-f',
      `137+140/${FORMAT}`,
    ]);
    expect(downloadArgs('u', 'w').slice(0, 2)).toEqual(['-f', FORMAT]);
    expect(
      FORMAT.startsWith('bv*[vcodec^=avc1][height<=1080]+ba[ext=m4a]/'),
    ).toBe(true);
  });

  it('keeps what ke-video needs of the details', () => {
    const info = readInfo({
      id: 'abc',
      title: 'T',
      uploader: 'U',
      duration: 312.5,
      description: 'D',
      chapters: [{ title: 'Intro', start_time: 0, end_time: 10 }],
      live_status: 'not_live',
      format_id: '137+140',
      requested_formats: [
        { height: 1080, filesize: 900 },
        { filesize_approx: 100 },
      ],
    });
    expect(info).toEqual({
      id: 'abc',
      title: 'T',
      channel: 'U',
      duration: 312.5,
      description: 'D',
      chapters: [{ title: 'Intro', start: 0, end: 10 }],
      live: false,
      height: 1080,
      format: '137+140',
      parts: [900, 100],
    });
  });

  it('shows its errors, and suggests an upgrade when YouTube looks changed', () => {
    const message = youtubeFailure('download the video', [
      'WARNING: something',
      'ERROR: [youtube] abc: Sign in to confirm you’re not a bot',
    ]);
    expect(message).toContain('yt-dlp could not download the video.');
    expect(message).toContain('Sign in to confirm');
    expect(message).toContain('brew upgrade yt-dlp');
    expect(
      youtubeFailure('x', ['ERROR: [youtube] abc: Video unavailable']),
    ).not.toContain('brew');
  });
});

describe('ffmpeg', () => {
  it('reads silencedetect, closing a silence still open at the end', () => {
    const reader = silenceReader();
    for (const line of [
      '[silencedetect @ 0x1] silence_start: 1.25',
      '[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 1.25',
      'size=N/A time=00:00:03.00',
      '[silencedetect @ 0x1] silence_start: -0.01',
      '[silencedetect @ 0x1] silence_end: 3.1 | silence_duration: 0.2',
      '[silencedetect @ 0x1] silence_start: 9.5',
    ])
      reader.line(line);
    expect(reader.done(10)).toEqual([
      { start: 1.25, end: 2.5 },
      { start: 0, end: 3.1 },
      { start: 9.5, end: 10 },
    ]);
  });

  it('reads -progress times', () => {
    expect(progressTime('out_time_us=1500000')).toBe(1.5);
    expect(progressTime('out_time_ms=2000000')).toBe(2);
    expect(progressTime('out_time=00:01:02.500000')).toBe(62.5);
    expect(progressTime('out_time=N/A')).toBeNull();
    expect(progressTime('frame=12')).toBeNull();
  });

  it('reads ffprobe: frame rate, starts and bitrate', () => {
    const probe = readProbe({
      format: { duration: '334.2', start_time: '0.000000' },
      streams: [
        {
          codec_type: 'video',
          avg_frame_rate: '30000/1001',
          start_time: '0.000000',
          bit_rate: '2500000',
          duration: '334.2',
        },
        {
          codec_type: 'audio',
          sample_rate: '44100',
          channels: 6,
          start_time: '0.021',
          duration: '334.1',
        },
      ],
    });
    expect(probe).toMatchObject({
      duration: 334.2,
      videoStart: 0,
      bitrate: 2_500_000,
      sampleRate: 44_100,
      channels: 2,
    });
    expect(probe.fps).toBeCloseTo(29.97);
    expect(probe.audioStart).toBeCloseTo(0.021);
  });

  it('knows whether VideoToolbox is listed', () => {
    expect(
      listsVideoToolbox(
        ' V....D h264_videotoolbox    VideoToolbox H.264 Encoder',
      ),
    ).toBe(true);
    expect(
      listsVideoToolbox(' V....D libx264              libx264 H.264'),
    ).toBe(false);
    expect(encoderArgs('x264', null)).toContain('libx264');
    expect(encoderArgs('videotoolbox', 2e6)).toContain('2500000');
  });

  it('selects frames half a frame inside each range, shifted to the window', () => {
    expect(
      selectFilter(
        [
          [10, 20],
          [30, 31],
        ],
        10,
        0,
        0.5,
      ),
    ).toBe(
      "select='between(t,0.450000,1.450000)+between(t,2.450000,2.550000)',setpts=N/FRAME_RATE/TB",
    );
  });
});
