import { Schema } from 'effect';
import { SpeechModelId } from '../../../../engine/transcript/index.ts';

const key = 'voice-anchors/model';

export const readChosenModel = (): SpeechModelId | null => {
  const stored = localStorage.getItem(key);
  return Schema.is(SpeechModelId)(stored) ? stored : null;
};

export const rememberChosenModel = (model: SpeechModelId | null): void => {
  if (model === null) localStorage.removeItem(key);
  else localStorage.setItem(key, model);
};
