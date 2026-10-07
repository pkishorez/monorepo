import { createSounds, haptic } from '@kstackz/expo-toolkit/feedback';
import type { CommandSound } from '@ledger/core/client/commands';

// The web's sounds, rendered to files by scripts/sounds.mjs and loaded up
// front, so each starts at once.
const sounds = createSounds({
  tick: require('../../assets/sounds/tick.wav'),
  success: require('../../assets/sounds/success.wav'),
  confirm: require('../../assets/sounds/confirm.wav'),
  open: require('../../assets/sounds/open.wav'),
  close: require('../../assets/sounds/close.wav'),
  coin: require('../../assets/sounds/coin.wav'),
  theme: require('../../assets/sounds/theme.wav'),
  arm: require('../../assets/sounds/arm.wav'),
});

/** Plays a Command's sound. */
export const playCommand = (sound: CommandSound) => sounds.play(sound);

/** A moment of the Thumb Lock: it locks, it Steps (or opens or goes back), it goes. */
export type GestureMoment = 'lock' | 'step' | 'go';

// Gesture Sounds, as on the web: a tick as it locks and at each Step, a
// gentle chime as it goes.
const GESTURE_SOUNDS = {
  lock: 'tick',
  step: 'tick',
  go: 'success',
} as const satisfies Record<GestureMoment, string>;

// Gesture Haptics: a light tap as it locks, a selection click at each Step,
// a firmer one as it goes.
const GESTURE_HAPTICS = {
  lock: 'light',
  step: 'selection',
  go: 'medium',
} as const satisfies Record<GestureMoment, Parameters<typeof haptic>[0]>;

/**
 * The Gesture Sounds and Gesture Haptics of one moment of the Thumb Lock,
 * each only while its own setting is on. A Wrong Way is no moment: it
 * makes neither.
 */
export const feelGesture = (
  moment: GestureMoment,
  on: { readonly sound: boolean; readonly haptics: boolean },
) => {
  if (on.sound) sounds.play(GESTURE_SOUNDS[moment]);
  if (on.haptics) haptic(GESTURE_HAPTICS[moment]);
};

/** A moment of a row swiped to delete: it arms past the line, it deletes. */
export type SwipeMoment = 'arm' | 'delete';

/**
 * The sound and buzz of a row swiped to delete, as on the web: the arm
 * click and a short buzz as it arms, the gentle chime as it deletes. Sounds
 * follow the Sounds setting, the buzz the Haptics one.
 */
export const feelSwipe = (
  moment: SwipeMoment,
  on: { readonly sound: boolean; readonly haptics: boolean },
) => {
  if (on.sound) sounds.play(moment === 'arm' ? 'arm' : 'success');
  if (on.haptics && moment === 'arm') haptic('light');
};
