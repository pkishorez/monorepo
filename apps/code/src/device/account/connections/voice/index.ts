import { VoiceLive } from './actor.ts';
import { Dictation } from './dictation/index.ts';
import { MicrophonePicker } from './microphone-picker/index.ts';
import { Around, VoiceView } from './view.tsx';

export type { Availability, Dictated } from './dictation/index.ts';

export const Voice = {
  actor: VoiceLive,
  view: VoiceView,
  Around,
  /** For a field that dictates: its own Dictation, the text that comes for it, and the mic. */
  useDictation: Dictation.useDictation,
  /** The same, drawn: for a field that may be drawn without Voice, or takes none, as a secret. */
  Field: Dictation.Field,
  /** For Layout: start or stop, open the Microphone Picker, and what Voice draws. */
  useVoice: Dictation.useVoice,
  /** For Layout's header: cancels the Dictation going, on every page. */
  Button: Dictation.button,
  /** For a tap elsewhere, such as Settings: opens the Microphone Picker. */
  Opener: MicrophonePicker.Opener,
};
export { Ask, Dictations, dictations, type Owner } from './voice.ts';
export { recorder } from './recorder/index.ts';
