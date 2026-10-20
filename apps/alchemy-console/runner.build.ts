import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';

/*
 * The runner, bundled into one file for its container image: everything it
 * imports is in `runner.mjs` but Node's own modules. The project's Alchemy
 * is never bundled: the runner loads it from the project's checkout.
 */

const root = import.meta.dirname;

/** Writes `runner.mjs` into `outDir`. */
export const buildRunner = async (outDir: string) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'console-runner-'));
  const entry = path.join(scratch, 'runner.mjs');
  await writeFile(
    entry,
    `import { main } from ${JSON.stringify(path.join(root, 'src/runner/index.ts'))};\nawait main();\n`,
  );
  try {
    await build({
      configFile: false,
      publicDir: false,
      root,
      logLevel: 'warn',
      ssr: { noExternal: true, target: 'node' },
      build: {
        outDir,
        emptyOutDir: true,
        ssr: entry,
        target: 'node22',
        minify: false,
        sourcemap: false,
        rolldownOptions: {
          output: { entryFileNames: 'runner.mjs', format: 'es' },
        },
      },
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};
