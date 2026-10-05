/**
 * The app's sounds, made by the browser as they play: no files to load,
 * each under 150 ms and quiet, so they confirm rather than announce.
 */
export type SoundName =
  /** One step through a list. */
  | 'tick'
  /** A Command is ready to run when the finger lifts. */
  | 'arm'
  /** A Command ran. */
  | 'confirm'
  /** A sheet opened. */
  | 'open'
  /** A sheet closed. */
  | 'close'
  /** Nothing to do that way. */
  | 'wrong'
  /** The theme changed. */
  | 'theme'
  /** Money saved. */
  | 'coin';

type Voice = (context: AudioContext, out: AudioNode, at: number) => void;

// One tone: a frequency gliding to `to`, rising fast and fading.
const tone =
  (options: {
    readonly from: number;
    readonly to?: number;
    readonly type?: OscillatorType;
    readonly length: number;
    readonly gain: number;
    readonly delay?: number;
  }): Voice =>
  (context, out, now) => {
    const at = now + (options.delay ?? 0);
    const end = at + options.length;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = options.type ?? 'sine';
    oscillator.frequency.setValueAtTime(options.from, at);
    if (options.to !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(options.to, end);
    }
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(options.gain, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(out);
    oscillator.start(at);
    oscillator.stop(end + 0.02);
  };

// A breath of filtered noise, its filter sweeping from `from` to `to` Hz.
const air =
  (options: {
    readonly from: number;
    readonly to: number;
    readonly length: number;
    readonly gain: number;
  }): Voice =>
  (context, out, at) => {
    const length = Math.ceil(context.sampleRate * options.length);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(options.from, at);
    filter.frequency.exponentialRampToValueAtTime(
      options.to,
      at + options.length,
    );
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(
      options.gain,
      at + options.length * 0.35,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, at + options.length);
    source.connect(filter).connect(gain).connect(out);
    source.start(at);
  };

const both =
  (...voices: ReadonlyArray<Voice>): Voice =>
  (context, out, at) => {
    for (const voice of voices) voice(context, out, at);
  };

const VOICES: Readonly<Record<SoundName, Voice>> = {
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
  open: air({ from: 500, to: 2400, length: 0.12, gain: 0.16 }),
  close: air({ from: 2200, to: 450, length: 0.11, gain: 0.14 }),
  wrong: both(
    tone({ from: 190, to: 120, type: 'square', length: 0.09, gain: 0.05 }),
    tone({
      from: 140,
      to: 95,
      type: 'square',
      length: 0.12,
      gain: 0.04,
      delay: 0.06,
    }),
  ),
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

let context: AudioContext | undefined;
let master: GainNode | undefined;
let on = true;

// The browser lets sound start only after the user touched or typed, so the
// context is made on the first sound, which always follows one.
const output = () => {
  if (typeof AudioContext === 'undefined') return undefined;
  if (context === undefined) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return { context, out: master! };
};

/** Plays one sound now, unless sound is off. */
export const play = (name: SoundName) => {
  if (!on) return;
  const audio = output();
  if (audio === undefined) return;
  VOICES[name](audio.context, audio.out, audio.context.currentTime);
};

/** Turns every sound on or off. */
export const setSound = (enabled: boolean) => {
  on = enabled;
};
