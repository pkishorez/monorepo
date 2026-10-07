/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// A phone runs the Thumb Lock and the Tree Walk on its UI thread, in the
// frame a finger moves, on a provider of their own (Reanimated's worklets).
// A function reaches that thread only when it is a worklet: its body starts
// with the 'worklet' directive, a plain string anywhere else. A worklet
// takes copies of what it closes over, so these modules keep no state at
// module level, only inside what their functions make.

const sources = import.meta.glob<string>(
  [
    '../direction/*.ts',
    '../provider/*.ts',
    '../thumb-lock/*.ts',
    '../tree-walk/*.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const files = Object.entries(sources).map(([file, code]) => ({
  file,
  lines: code.split('\n'),
}));

// Each function declared at the top of a file, by name, and whether its
// body starts with the directive: a top-level `const` whose value starts
// as a function does (`(` or `<`), up to the first line that opens its
// body (`=> {`).
const functions = (lines: ReadonlyArray<string>) =>
  lines.flatMap((line, at) => {
    const found = /^(?:export )?const (\w+)[^=]*= *([(<]|$)/.exec(line);
    if (
      found === null ||
      (found[2] === '' && !/^\s*[(<]/.test(lines[at + 1] ?? ''))
    ) {
      return [];
    }
    const opens = lines.findIndex(
      (each, index) => index >= at && each.endsWith('=> {'),
    );
    const first = opens < 0 ? undefined : lines[opens + 1]?.trim();
    return [{ name: found[1] ?? '', worklet: first === "'worklet';" }];
  });

describe('the core a phone runs on its UI thread is worklet-safe', () => {
  it('finds its sources and their functions', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(
      files.flatMap(({ lines }) => functions(lines)).length,
    ).toBeGreaterThan(12);
  });

  it('makes every function a worklet', () => {
    const plain = files.flatMap(({ file, lines }) =>
      functions(lines)
        .filter((fn) => !fn.worklet)
        .map((fn) => `${file}: ${fn.name}`),
    );
    expect(plain).toEqual([]);
  });

  it('keeps no state at module level', () => {
    const mutable = files.flatMap(({ file, lines }) =>
      lines
        .filter((line) => /^(?:export )?(?:let|var) /.test(line))
        .map((line) => `${file}: ${line}`),
    );
    expect(mutable).toEqual([]);
  });
});
