// A short, soft tick: a sine falling an octave, over in 60ms.
const TICK_HZ = 1400;
const TICK_S = 0.06;
const TICK_GAIN = 0.12;

type Haptic = { readonly vibrate?: (pattern: number) => boolean };

/**
 * Tells the user the Hold came on: a haptic tick where the platform has
 * one, and a soft click sound when `sound`. Android vibrates; iOS Safari
 * has no vibration, but toggling a hidden switch input plays its system
 * haptic (Safari 17.4+). Browsers only play sound once a touch has unlocked
 * it, so `prepare` must be called while handling a touch.
 */
export const createHoldFeedback = (doc: Document) => {
  const win = doc.defaultView ?? window;
  let audio: AudioContext | undefined;
  let toggle: HTMLLabelElement | undefined;

  const switchLabel = () => {
    if (toggle !== undefined) return toggle;
    const label = doc.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    doc.body.appendChild(label);
    toggle = label;
    return label;
  };

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
    /** Unlocks sound while a touch is being handled. */
    prepare: (sound: boolean) => {
      if (!sound || typeof win.AudioContext !== 'function') return;
      audio ??= new win.AudioContext();
      if (audio.state === 'suspended') void audio.resume();
    },
    /** The Hold came on. */
    tick: (sound: boolean) => {
      const haptic = win.navigator as Haptic;
      if (typeof haptic.vibrate === 'function') haptic.vibrate(10);
      else switchLabel().click();
      if (sound && audio?.state === 'running') click(audio);
    },
    dispose: () => {
      toggle?.remove();
      void audio?.close();
    },
  };
};

export type HoldFeedback = ReturnType<typeof createHoldFeedback>;
