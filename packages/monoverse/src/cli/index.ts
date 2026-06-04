import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'effect/unstable/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, Layer } from 'effect';
import { Monoverse } from '../core/index.js';
import {
  tui,
  updates,
  add,
  rm,
  format,
  lint,
  fix,
  ls,
} from './commands/index.js';

const getVersion = (): string => {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return `v${pkg.version}`;
  } catch {
    return 'na';
  }
};

const monoverse = Command.make('monoverse', {}, () =>
  Console.log('Use --help to see available commands'),
);

const command = monoverse.pipe(
  Command.withSubcommands([
    // Core commands
    lint,
    fix,
    format,

    // To manage dependencies
    add,
    rm,
    ls,

    // TUI
    tui,
    updates,
  ]),
);

const cli = Command.run(command, {
  version: getVersion(),
});

const MainLayer = Layer.mergeAll(NodeServices.layer, Monoverse.layer);

cli.pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
