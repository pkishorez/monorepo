import { Command } from '@effect/cli';
import { Effect } from 'effect';

export const tui = Command.make('tui', {}, () => Effect.void);
