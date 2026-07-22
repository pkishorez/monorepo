import { decision } from 'laymos/story';

export const value = decision('Choice', {}, input)
  .when(key, {}, () => effect)
  .exhaustive();
