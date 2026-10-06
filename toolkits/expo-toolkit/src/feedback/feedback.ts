import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioSource,
} from 'expo-audio';
import { buzz, type Haptic } from './haptics';
import { makePool } from './pool';

/**
 * Plays one haptic. Fire and forget: a device without a haptic engine, or
 * one with haptics turned off, simply feels nothing.
 */
export function haptic(kind: Haptic): void {
  buzz(kind).catch(() => {});
}

/**
 * Loads short sounds up front, `voices` players each (3 by default), so
 * `play` starts at once and a quick repeat overlaps instead of waiting.
 * Sounds mix with other apps' audio and stay quiet when the phone is on
 * silent. Call `release` when the sounds are no longer needed.
 *
 * ```ts
 * const sounds = createSounds({ tick: require('./tick.wav') });
 * sounds.play('tick');
 * ```
 */
export function createSounds<Name extends string>(
  sources: Record<Name, AudioSource>,
  options: { voices?: number; volume?: number } = {},
) {
  setAudioModeAsync({
    interruptionMode: 'mixWithOthers',
    playsInSilentMode: false,
  }).catch(() => {});

  const names = Object.keys(sources) as Array<Name>;
  return makePool(names, options.voices ?? 3, (name) => {
    const player = createAudioPlayer(sources[name]);
    player.volume = options.volume ?? 1;
    return {
      restart() {
        player.seekTo(0).catch(() => {});
        player.play();
      },
      release() {
        player.remove();
      },
    };
  });
}
