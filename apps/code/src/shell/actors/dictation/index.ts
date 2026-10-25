import { DictationLive } from './actor.ts';
import {
  Dictating,
  DictationBadge,
  DraftsShown,
  useDictation,
  useDictationKeys,
  useDraftsShown,
} from './view.tsx';

export type { Availability } from './view.tsx';

export const Dictation = {
  actor: DictationLive,
  view: DictationBadge,
  Dictating,
  DraftsShown,
  useDictation,
  useDictationKeys,
  useDraftsShown,
};
