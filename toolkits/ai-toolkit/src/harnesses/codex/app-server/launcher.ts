import { createRequire } from 'node:module';
import { Effect } from 'effect';
import { HarnessBinaries } from '../../../harness/index.js';

/** How to run Codex: a command and the arguments that come before Codex's own. */
export interface Launcher {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  /** The executable a person would name: the configured path, or the npm launcher. */
  readonly path: string;
  /** No Harness Binary is configured: the bundled npm `@openai/codex` runs. */
  readonly isDefault: boolean;
}

const bundledEntry = (): string =>
  createRequire(import.meta.url).resolve('@openai/codex/bin/codex.js');

/** The configured Harness Binary, else the bundled npm launcher under this Node. */
export const launcher: Effect.Effect<Launcher, never, HarnessBinaries> =
  Effect.gen(function* () {
    const binaries = yield* HarnessBinaries;
    const configured = yield* binaries.path('codex');
    if (configured !== undefined)
      return {
        command: configured,
        args: [],
        path: configured,
        isDefault: false,
      };
    const entry = bundledEntry();
    return {
      command: process.execPath,
      args: [entry],
      path: entry,
      isDefault: true,
    };
  });
