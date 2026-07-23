import { Effect } from 'effect';
import { flow } from 'laymos/story';

export const result = flow('Load', {}, () => Effect.succeed(1))();
