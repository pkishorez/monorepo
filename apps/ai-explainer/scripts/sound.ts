// Usage: pnpm sound
// Synthesises the Foundation's music bed and sound effects with ffmpeg into
// src/foundation/sound/sounds/. Nothing is downloaded or licensed: every
// sound is a formula. The files are small and committed, like voiceovers.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bed as bedLoop } from '../src/foundation/sound/bed.ts';

const out = resolve('src/foundation/sound/sounds');
const scratch = mkdtempSync(join(tmpdir(), 'sound-'));

// ffmpeg reports on stderr; a failed run throws with that report.
function ffmpeg(args: string[]) {
  const run = spawnSync('ffmpeg', ['-y', '-hide_banner', ...args], {
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(run.stderr);
  return run.stderr;
}

function level(file: string) {
  const report = ffmpeg([
    '-i',
    file,
    '-af',
    'ebur128=framelog=quiet:peak=sample',
    '-f',
    'null',
    '-',
  ]);
  const summary = report.slice(report.lastIndexOf('Summary:'));
  return {
    lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)![1]),
    peak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)![1]),
  };
}

// Renders `filter` over lavfi `sources` and levels it: a bed by integrated
// loudness, a short effect by its peak, which is how the ear judges each.
function render(
  name: string,
  sources: string[],
  filter: string,
  target: { lufs: number } | { peak: number },
) {
  const raw = join(scratch, `${name}.wav`);
  ffmpeg([
    ...sources.flatMap((source) => ['-f', 'lavfi', '-i', source]),
    '-filter_complex',
    filter,
    '-ar',
    '48000',
    raw,
  ]);
  const measured = level(raw);
  const gain =
    'lufs' in target
      ? target.lufs - measured.lufs
      : target.peak - measured.peak;
  const file = join(out, `${name}.mp3`);
  ffmpeg([
    '-i',
    raw,
    '-af',
    `volume=${gain.toFixed(2)}dB`,
    '-b:a',
    '96k',
    file,
  ]);
  const final = level(file);
  console.log(
    `${name}: ${final.lufs.toFixed(1)} LUFS, peak ${final.peak.toFixed(1)} dBFS`,
  );
}

const sum = (terms: string[]) => terms.join('+');

// A note's frequency, rounded so it completes whole cycles in `loop`
// seconds: the bed then repeats without a seam.
const note = (hz: number, loop: number) => Math.round(hz * loop) / loop;

// The bed: four warm chords in D, eight seconds each, crossfading through
// raised-cosine windows that always sum to one. Every frequency and swell
// fits the 32-second loop exactly.
function bed() {
  const { loop, overlap } = bedLoop;
  const hop = 8;
  const chords = [
    [146.83, 220, 277.18, 329.63, 369.99], // Dmaj9
    [123.47, 185, 220, 293.66, 329.63], // Bm11
    [98, 146.83, 246.94, 293.66, 369.99], // Gmaj7
    [110, 164.81, 246.94, 277.18, 329.63], // Asus2
  ];
  const channel = (detune: number) =>
    sum(
      chords.map((chord, i) => {
        const centre = hop * i + hop / 2;
        const distance = `(mod(t-${centre}+${loop * 1.5},${loop})-${loop / 2})`;
        const window = `if(lt(abs(${distance}),${hop}),pow(cos(PI*${distance}/${hop * 2}),2),0)`;
        const tones = sum(
          chord.map((hz, k) => {
            const f = note(hz * (1 + detune), loop);
            const weight = (0.32 / (1 + k * 0.45)).toFixed(3);
            return `${weight}*(sin(2*PI*${f}*t)+0.12*sin(4*PI*${f}*t))`;
          }),
        );
        return `${window}*(${tones})`;
      }),
    );
  const breathe = `(1+0.18*sin(2*PI*t/16))`;
  // The second of three loops is kept, so the room's echo already flows in,
  // with `overlap` seconds more to crossfade into the next repeat.
  render(
    'music-bed',
    [
      `aevalsrc=exprs='${breathe}*(${channel(-0.0015)})|${breathe}*(${channel(0.0015)})':s=48000:d=${loop * 3}`,
    ],
    `[0]lowpass=f=1100,highpass=f=60,aecho=0.8:0.6:90|170:0.22|0.14,atrim=start=${loop}:duration=${loop + overlap},asetpts=N/SR/TB`,
    { lufs: -28 },
  );
}

// Air moving past: pink noise through a band that opens and closes.
function whoosh() {
  const seconds = 0.9;
  render(
    'whoosh',
    [`anoisesrc=color=pink:d=${seconds}:a=0.5:s=48000`],
    `[0]bandpass=f=650:width_type=o:w=2.2,lowpass=f=2400,highpass=f=180,volume='pow(sin(PI*pow(t/${seconds},0.75)),3)':eval=frame,aecho=0.6:0.5:40:0.2,pan=stereo|c0=c0|c1=c0`,
    { peak: -9 },
  );
}

// A small soft tick: two damped tones, no sharp edge.
function click() {
  render(
    'click',
    [
      `aevalsrc=exprs='(1-exp(-t*900))*(0.6*sin(2*PI*1500*t)*exp(-t*70)+0.25*sin(2*PI*2900*t)*exp(-t*140))':s=48000:d=0.12`,
    ],
    `[0]lowpass=f=4500,pan=stereo|c0=c0|c1=c0`,
    { peak: -14 },
  );
}

// A rising chord in D that blooms into the moment it lands on, then lets go.
function swell() {
  const seconds = 3;
  const chord = [146.83, 220, 293.66, 369.99, 440];
  const tones = sum(
    chord.map(
      (hz, k) =>
        `${(0.3 / (1 + k * 0.3)).toFixed(3)}*sin(2*PI*${hz}*t*(1+0.003*sin(2*PI*5*t)))`,
    ),
  );
  const envelope = `pow(t/${seconds},2.4)*if(gt(t,${seconds - 0.12}),(${seconds}-t)/0.12,1)`;
  render(
    'swell',
    [
      `aevalsrc=exprs='${envelope}*(${tones})':s=48000:d=${seconds}`,
      `anoisesrc=color=pink:d=${seconds}:a=0.25:s=48000`,
    ],
    `[1]bandpass=f=1200:width_type=o:w=2,volume='pow(t/${seconds},3)':eval=frame[air];[0][air]amix=inputs=2:weights=1 0.35:normalize=0,lowpass=f=3500,aecho=0.8:0.7:110|190:0.25|0.15,pan=stereo|c0=c0|c1=c0`,
    { peak: -10 },
  );
}

// A soft bell: inharmonic partials decaying at their own rates, a fifth
// answering a moment later.
function chime() {
  const bell = (hz: number, start: number) => {
    const t = `(t-${start})`;
    const partials: [number, number, number][] = [
      [1, 0.55, 2.2],
      [2, 0.22, 3.4],
      [2.76, 0.12, 5],
      [4.07, 0.05, 7.5],
    ];
    return `if(gte(t,${start}),(1-exp(-${t}*400))*(${sum(
      partials.map(
        ([ratio, gain, decay]) =>
          `${gain}*sin(2*PI*${(hz * ratio).toFixed(2)}*${t})*exp(-${t}*${decay})`,
      ),
    )}),0)`;
  };
  render(
    'chime',
    [
      `aevalsrc=exprs='${bell(587.33, 0)}+0.7*${bell(880, 0.14)}':s=48000:d=3.5`,
    ],
    `[0]lowpass=f=5000,aecho=0.8:0.6:120|210:0.2|0.12,afade=t=out:st=2.6:d=0.9,pan=stereo|c0=c0|c1=c0`,
    { peak: -12 },
  );
}

mkdirSync(out, { recursive: true });
bed();
whoosh();
click();
swell();
chime();
rmSync(scratch, { recursive: true });
