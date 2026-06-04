import { Command } from 'effect/unstable/cli';
import { Effect } from 'effect';
import { renderTui } from '../../tui/index.js';

export const updates = Command.make('updates', {}, () =>
  Effect.promise(() => renderTui(process.cwd())),
);
