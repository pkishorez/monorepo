import { MicrophonePickerLive } from './actor.ts';
import {
  Keys,
  MicrophonePickerButton,
  MicrophonePickerView,
  Opener,
} from './view.tsx';

export const MicrophonePicker = {
  actor: MicrophonePickerLive,
  view: MicrophonePickerView,
  button: MicrophonePickerButton,
  Keys,
  Opener,
};
