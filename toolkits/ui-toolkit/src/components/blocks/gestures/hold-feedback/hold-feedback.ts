// A short, soft tick: a sine falling an octave, over in 60ms.
const TICK_HZ = 1400;
const TICK_S = 0.06;
const TICK_GAIN = 0.12;

type Haptic = { readonly vibrate?: (pattern: number) => boolean };

/**
 * Tells the user a pressed Hold came on: a short vibration where the
 * browser can vibrate (Android), and a soft click sound where it cannot
 * (iOS Safari). Browsers only start sound once a touch has lifted on the
 * page, so `prepare` must be called while handling a finger lifting; iOS
 * also mutes it while the phone is on silent.
 */
export const createHoldFeedback = (doc: Document) => {
  const win = doc.defaultView ?? window;
  const haptic = win.navigator as Haptic;
  let audio: AudioContext | undefined;

  const click = (context: AudioContext) => {
    const now = context.currentTime;
    const tone = context.createOscillator();
    const level = context.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(TICK_HZ, now);
    tone.frequency.exponentialRampToValueAtTime(TICK_HZ / 2, now + TICK_S);
    level.gain.setValueAtTime(0.0001, now);
    level.gain.exponentialRampToValueAtTime(TICK_GAIN, now + 0.004);
    level.gain.exponentialRampToValueAtTime(0.0001, now + TICK_S);
    tone.connect(level).connect(context.destination);
    tone.start(now);
    tone.stop(now + TICK_S);
  };

  return {
    /** Unlocks sound, where it is the feedback, while a finger lifts. */
    prepare: () => {
      if (typeof haptic.vibrate === 'function') return;
      if (typeof win.AudioContext !== 'function') return;
      audio ??= new win.AudioContext();
      if (audio.state === 'suspended') void audio.resume();
    },
    /** A pressed Hold came on. */
    tick: () => {
      if (typeof haptic.vibrate === 'function') haptic.vibrate(12);
      else if (audio?.state === 'running') click(audio);
    },
    dispose: () => {
      void audio?.close();
    },
  };
};

export type HoldFeedback = ReturnType<typeof createHoldFeedback>;
