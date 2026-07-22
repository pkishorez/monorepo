import { Effect } from 'effect';
import { omit } from 'laymos/story';

export const result = omit('Internal detail', () => Effect.void);
