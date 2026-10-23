import { MicrophonePickerLive } from './actor.ts';
import { MicrophonePickerButton, MicrophonePickerView } from './view.tsx';

export const MicrophonePicker = {
  actor: MicrophonePickerLive,
  view: MicrophonePickerView,
  button: MicrophonePickerButton,
};
