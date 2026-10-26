import { VoiceLive } from './actor.ts';
import { Dictation } from './dictation/index.ts';
import { MicrophonePicker } from './microphone-picker/index.ts';
import { Around, VoiceView } from './view.tsx';

export type { Availability } from './dictation/index.ts';

export const Voice = {
  actor: VoiceLive,
  view: VoiceView,
  Around,
  /** For a Draft: say it is drawn, take the text that comes, and the mic. */
  useDictation: Dictation.useDictation,
  /** For Layout: start or stop, open the Microphone Picker, and what Voice draws. */
  useVoice: Dictation.useVoice,
  /** For Layout's header: the mic, on every page. */
  Button: Dictation.button,
  /** For a tap elsewhere, such as Settings: opens the Microphone Picker. */
  Opener: MicrophonePicker.Opener,
};
export { Ask, Dictations, dictations } from './voice.ts';
export { recorder } from './recorder/index.ts';
