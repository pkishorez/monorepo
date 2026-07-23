import { decision, exhaustive, when } from 'laymos/story';

export const value = decision('Choice', {}, input).pipe(
  when(key, {}, () => effect),
  exhaustive,
);
