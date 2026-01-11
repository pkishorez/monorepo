import { Command } from '@effect/cli';
import { Console, Effect } from 'effect';
import { Monoverse } from '../../core/index.js';
import { cwd } from '../helpers.js';

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[38;2;102;102;102m',
  white: '\x1b[38;2;255;255;255m',
};

export const debug = Command.make('debug', {}, () =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const analysis = yield* monoverse.analyze(cwd);

    yield* Console.log(`${c.white}Root${c.reset} ${analysis.root}\n`);
    yield* Console.log(`${c.white}Workspaces${c.reset} (${analysis.workspaces.length})\n`);

    for (const workspace of analysis.workspaces) {
      const relativePath =
        workspace.path === analysis.root
          ? '.'
          : workspace.path.replace(analysis.root + '/', '');

      yield* Console.log(
        `  ${c.white}${workspace.name}${c.reset} ${c.dim}${relativePath}${c.reset}`,
      );
    }

    if (analysis.errors.length > 0) {
      yield* Console.log(`\n${c.white}Errors${c.reset} (${analysis.errors.length})\n`);
      for (const error of analysis.errors) {
        yield* Console.log(`  ${error.path}: ${error.message}`);
      }
    }
  }),
);
