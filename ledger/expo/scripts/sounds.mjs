// Renders Ledger's sounds to assets/sounds/*.wav: the same voices the web
// makes with Web Audio as they play (ledger/web/src/client/kit/sound), here
// rendered once to files, as a phone plays preloaded players instead.
//   node scripts/sounds.mjs            every sound
//   node scripts/sounds.mjs arm        only those named (the noise voices
//                                      differ on each render)
import { writeFileSync } from 'node:fs';

const RATE = 44100;
const MASTER = 0.9;
const FLOOR = 0.0001;

// An exponential ramp from `a` to `b` over [t0, t1], held after.
const ramp = (a, b, t0, t1, t) =>
  t <= t0 ? a : t >= t1 ? b : a * (b / a) ** ((t - t0) / (t1 - t0));

const wave = {
  sine: (phase) => Math.sin(2 * Math.PI * phase),
  triangle: (phase) => 1 - 4 * Math.abs(((phase + 0.25) % 1) - 0.5),
  square: (phase) => (phase % 1 < 0.5 ? 1 : -1),
};

// One tone: a frequency gliding to `to`, rising fast and fading.
const tone =
  ({ from, to, type = 'sine', length, gain, delay = 0 }) =>
  (out) => {
    let phase = 0;
    const start = Math.round(delay * RATE);
    const n = Math.round((length + 0.02) * RATE);
    for (let i = 0; i < n && start + i < out.length; i++) {
      const t = i / RATE;
      const f = to === undefined ? from : ramp(from, to, 0, length, t);
      phase += f / RATE;
      const g =
        t < 0.006
          ? ramp(FLOOR, gain, 0, 0.006, t)
          : ramp(gain, FLOOR, 0.006, length, t);
      out[start + i] += wave[type](phase) * g;
    }
  };

// A breath of noise through a band-pass filter sweeping from `from` to `to`.
const air =
  ({ from, to, length, gain }) =>
  (out) => {
    const q = 1.4;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    const n = Math.round(length * RATE);
    for (let i = 0; i < n && i < out.length; i++) {
      const t = i / RATE;
      const w = (2 * Math.PI * ramp(from, to, 0, length, t)) / RATE;
      const alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      const x = Math.random() * 2 - 1;
      const y =
        (alpha * x - alpha * x2 - -2 * Math.cos(w) * y1 - (1 - alpha) * y2) /
        a0;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      const g =
        t < length * 0.35
          ? ramp(FLOOR, gain, 0, length * 0.35, t)
          : ramp(gain, FLOOR, length * 0.35, length, t);
      out[i] += y * g;
    }
  };

const both =
  (...voices) =>
  (out) => {
    for (const voice of voices) voice(out);
  };

// The web's voices, by name (kit/sound/sound.ts), but for 'wrong', which
// nothing on the phone plays (a Wrong Way is silent).
const VOICES = {
  tick: tone({ from: 1850, to: 1400, length: 0.025, gain: 0.12 }),
  arm: tone({
    from: 1180,
    to: 1320,
    type: 'triangle',
    length: 0.05,
    gain: 0.12,
  }),
  confirm: both(
    tone({ from: 660, length: 0.07, gain: 0.14, type: 'triangle' }),
    tone({
      from: 990,
      length: 0.09,
      gain: 0.12,
      type: 'triangle',
      delay: 0.05,
    }),
  ),
  success: tone({ from: 1320, to: 1760, length: 0.07, gain: 0.07 }),
  open: air({ from: 500, to: 2400, length: 0.12, gain: 0.16 }),
  close: air({ from: 2200, to: 450, length: 0.11, gain: 0.14 }),
  theme: both(
    tone({ from: 880, length: 0.12, gain: 0.08 }),
    tone({ from: 1320, length: 0.14, gain: 0.06, delay: 0.03 }),
    tone({ from: 1760, length: 0.15, gain: 0.04, delay: 0.06 }),
  ),
  coin: both(
    tone({ from: 1568, length: 0.06, gain: 0.1, type: 'triangle' }),
    tone({
      from: 2093,
      length: 0.12,
      gain: 0.09,
      type: 'triangle',
      delay: 0.055,
    }),
  ),
};

const wav = (samples) => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, s * MASTER)) * 32767),
      i * 2,
    ),
  );
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
};

const only = process.argv.slice(2);
for (const [name, voice] of Object.entries(VOICES)) {
  if (only.length > 0 && !only.includes(name)) continue;
  const out = new Float64Array(Math.round(0.25 * RATE));
  voice(out);
  // Trim the silence after the last sound.
  let end = out.length;
  while (end > 0 && Math.abs(out[end - 1]) < 1e-4) end--;
  const file = new URL(`../assets/sounds/${name}.wav`, import.meta.url);
  writeFileSync(file, wav(out.subarray(0, end + 64)));
  console.log(name, `${Math.round((end / RATE) * 1000)} ms`);
}
