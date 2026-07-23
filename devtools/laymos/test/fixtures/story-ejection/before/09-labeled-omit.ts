import { Effect } from 'effect';
import { omit } from 'laymos/story';

export const result = omit(
  { reason: 'Internal detail.' },
  () => Effect.void,
);
