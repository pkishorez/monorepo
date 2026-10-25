import { MicrophonePickerLive } from './actor.ts';
import {
  MicrophonePickerButton,
  MicrophonePickerView,
  Opener,
} from './view.tsx';

export const MicrophonePicker = {
  actor: MicrophonePickerLive,
  view: MicrophonePickerView,
  button: MicrophonePickerButton,
  Opener,
};
