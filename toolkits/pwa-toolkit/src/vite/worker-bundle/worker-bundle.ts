import { type AliasOptions, build, type Rolldown } from 'vite';
import type { WorkerBuildInfo } from '../../domain/config/index.js';
import { buildModulePlugin } from './build-module.js';
import { resolveWorkerEntry } from './entry.js';
import { killSwitchSource } from './kill-switch.js';

type WorkerScriptInput =
  | { readonly killSwitch: true }
  | {
      readonly killSwitch: false;
      readonly info: WorkerBuildInfo;
      /** Vite root of the app. */
      readonly root: string;
      /** The `worker` option; `null` picks `src/sw.ts` or the built-in entry. */
      readonly worker: string | null;
      readonly mode: string;
      readonly alias: AliasOptions;
      readonly minify: boolean;
    };

const entryChunkOf = (
  output: Rolldown.RolldownOutput | ReadonlyArray<Rolldown.RolldownOutput>,
): string => {
  const outputs = Array.isArray(output) ? output : [output];
  for (const { output: files } of outputs as Rolldown.RolldownOutput[]) {
    for (const file of files) {
      if (file.type === 'chunk' && file.isEntry) return file.code;
    }
  }
  throw new Error('pwa-toolkit: the worker build produced no entry chunk');
};

/**
 * The service worker script: the Kill Switch, or the worker entry bundled as
 * one classic (iife) script with its WorkerBuildInfo inlined. Nothing is
 * written; the caller decides where the script goes.
 */
export const workerScript = async (
  input: WorkerScriptInput,
): Promise<string> => {
  if (input.killSwitch) return killSwitchSource();
  const output = await build({
    configFile: false,
    root: input.root,
    mode: input.mode,
    logLevel: 'warn',
    publicDir: false,
    resolve: { alias: input.alias },
    plugins: [buildModulePlugin(input.info)],
    build: {
      write: false,
      copyPublicDir: false,
      emptyOutDir: false,
      minify: input.minify,
      sourcemap: false,
      modulePreload: false,
      reportCompressedSize: false,
      rolldownOptions: {
        input: resolveWorkerEntry(input.root, input.worker),
        output: {
          format: 'iife',
          entryFileNames: 'sw.js',
          codeSplitting: false,
        },
      },
    },
  });
  return entryChunkOf(
    output as Rolldown.RolldownOutput | Rolldown.RolldownOutput[],
  );
};
