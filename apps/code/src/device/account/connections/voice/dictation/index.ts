import { DictationLive } from './actor.ts';
import { DictationButton } from './button.tsx';
import {
  Dictating,
  DictationBadge,
  DictationField,
  owners,
  useDictation,
  useVoice,
} from './view.tsx';

export type { Availability, Dictated } from './view.tsx';

export const Dictation = {
  actor: DictationLive,
  view: DictationBadge,
  button: DictationButton,
  Dictating,
  owners,
  useDictation,
  Field: DictationField,
  useVoice,
};
