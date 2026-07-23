import { decision, when } from 'laymos/story';

export const value = decision('Choice', {}, input).pipe(
  when('a', {}, () => effect),
);
