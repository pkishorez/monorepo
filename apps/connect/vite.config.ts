/*
 * `vp pack`: two self-contained ESM files, every JavaScript dependency
 * inlined and Node's own modules left as imports, so installing one needs
 * no other package.
 *
 * - `dist/plugin/code.mjs` (pnpm build:plugin): the code Plugin as
 *   Connect downloads it. sherpa-onnx is loaded at run time from the
 *   Speech to Text folder, never bundled.
 * - `dist/cli/ke-connect.mjs`: the `ke-connect` command, as `bin/` runs it.
 *   It sits two folders down, as `dist/connection/` does, so it finds
 *   `package.json` where `tsc`'s build does. `shims` gives it `__dirname`,
 *   which the cloudflared package reads as it loads.
 */
const bundled = {
  format: 'esm',
  platform: 'node',
  fixedExtension: true,
  tsconfig: 'tsconfig.build.json',
  dts: false,
  publint: false,
  deps: { alwaysBundle: [/./], onlyBundle: false },
} as const;

export default {
  pack: [
    {
      ...bundled,
      entry: { code: 'src/plugins/code/serve/main.ts' },
      outDir: 'dist/plugin',
    },
    {
      ...bundled,
      entry: { 'ke-connect': 'src/connection/index.ts' },
      outDir: 'dist/cli',
      shims: true,
    },
  ],
};
