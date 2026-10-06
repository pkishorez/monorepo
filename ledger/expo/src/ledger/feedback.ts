import { createSounds, haptic } from '@kstackz/expo-toolkit/feedback';
import type { CommandSound } from '@ledger/core/client/commands';

// One short tick for now; the web makes each Command's sound on demand.
// TODO(Phase 3c): a sound per CommandSound and for the Thumb Lock.
const sounds = createSounds({ tick: require('../../assets/sounds/tick.wav') });

/** Plays a Command's sound. */
export const playCommand = (_sound: CommandSound) => sounds.play('tick');

/** What a gesture feels like: a haptic, if the Haptics setting is on. */
export const buzz = (on: boolean, kind: Parameters<typeof haptic>[0]) => {
  if (on) haptic(kind);
};
