import { DictationLive } from './actor.ts';
import { DictationButton } from './button.tsx';
import { Dictating, DictationBadge, useDictation, useVoice } from './view.tsx';

export type { Availability } from './view.tsx';

export const Dictation = {
  actor: DictationLive,
  view: DictationBadge,
  button: DictationButton,
  Dictating,
  useDictation,
  useVoice,
};
