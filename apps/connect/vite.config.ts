/*
 * `vp pack` (pnpm build:plugin): the code Plugin as Connect downloads it,
 * one self-contained ESM file, `dist/plugin/code.mjs`. Every JavaScript
 * dependency is inlined and Node's own modules stay imports; sherpa-onnx
 * is loaded at run time from the Speech to Text folder, never bundled.
 */
export default {
  pack: {
    entry: { code: 'src/plugins/code/main.ts' },
    outDir: 'dist/plugin',
    format: 'esm',
    platform: 'node',
    fixedExtension: true,
    tsconfig: 'tsconfig.build.json',
    dts: false,
    publint: false,
    deps: { alwaysBundle: [/./], onlyBundle: false },
  },
};
