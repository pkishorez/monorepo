import { describe, expect, test } from 'vitest';

import { buildModuleTree } from '../../module-tree/index.js';
import {
  expandRules,
  findRuleLoops,
  judgeImport,
  reachOf,
  validateAgainstTree,
  wouldLoop,
} from '../index.js';

const tree = buildModuleTree(
  [
    'src/a/index.ts',
    'src/a/deep/index.ts',
    'src/a/deep/inner.ts',
    'src/b/index.ts',
    'src/b/x/index.ts',
    'src/c/index.ts',
    'src/lib/utils.ts',
  ],
  ['src/lib/utils.ts'],
);

const config = {
  sourceRoots: ['src'],
  ignoredPaths: [],
  fileModules: ['src/lib/utils.ts'],
  rules: { 'src/a': ['src/b/x'], '*': ['src/lib'] },
  exceptions: [
    { from: 'src/a/deep', to: 'src/a', because: 'the deep part boots a' },
  ],
};

const law = {
  tree,
  rules: expandRules(config, tree),
  exceptions: config.exceptions,
};

describe('expandRules', () => {
  test('turns a Shared Rule into one Rule from every sibling', () => {
    expect(law.rules).toEqual([
      { from: 'src/a', to: 'src/b/x' },
      { from: 'src/a', to: 'src/lib' },
      { from: 'src/b', to: 'src/lib' },
      { from: 'src/c', to: 'src/lib' },
    ]);
  });
});

describe('judgeImport', () => {
  const judge = (from: string, to: string) =>
    judgeImport(law, from, to)?.verdict;

  test('is silent inside one Module', () => {
    expect(judge('src/a/deep/index.ts', 'src/a/deep/inner.ts')).toBeUndefined();
  });

  test('lets own files reach any nested Index', () => {
    expect(judge('src/a/index.ts', 'src/a/deep/index.ts')).toEqual({
      kind: 'nested',
    });
  });

  test('reads a Rule down to the nested target and up from the nested source', () => {
    expect(judge('src/a/deep/inner.ts', 'src/b/x/index.ts')).toEqual({
      kind: 'rule',
      rule: { from: 'src/a', to: 'src/b/x' },
    });
    expect(judge('src/a/index.ts', 'src/lib/utils.ts')).toEqual({
      kind: 'rule',
      rule: { from: 'src/a', to: 'src/lib' },
    });
  });

  test('does not let a narrow Rule grant the whole Wrapper', () => {
    expect(judge('src/a/index.ts', 'src/b/index.ts')).toEqual({
      kind: 'violation',
      reason: 'no-rule',
      remedy: 'rule',
    });
  });

  test('refuses anything but the Index, whatever the Rules say', () => {
    expect(judge('src/a/index.ts', 'src/a/deep/inner.ts')).toEqual({
      kind: 'violation',
      reason: 'not-index',
      remedy: 'none',
    });
  });

  test('lets an Exception lift a child importing its parent', () => {
    expect(judge('src/a/deep/index.ts', 'src/a/index.ts')).toEqual({
      kind: 'exception',
      exception: config.exceptions[0],
    });
    expect(judge('src/b/x/index.ts', 'src/b/index.ts')).toEqual({
      kind: 'violation',
      reason: 'ancestor',
      remedy: 'exception',
    });
  });

  test('says an import that would loop the Rules needs an Exception', () => {
    expect(judge('src/b/x/index.ts', 'src/a/index.ts')).toEqual({
      kind: 'violation',
      reason: 'against-rule',
      remedy: 'exception',
    });
  });
});

describe('findRuleLoops', () => {
  test('follows Rules through folder nesting', () => {
    const loops = findRuleLoops([
      { from: 'src/a', to: 'src/b' },
      { from: 'src/b/x', to: 'src/a/deep' },
    ]);

    expect(loops).toHaveLength(1);
    expect(wouldLoop(law.rules, { from: 'src/b/x', to: 'src/a' })).toBe(true);
    expect(wouldLoop(law.rules, { from: 'src/c', to: 'src/a' })).toBe(false);
  });
});

describe('validateAgainstTree', () => {
  test('accepts the Config the tree holds', () => {
    expect(validateAgainstTree(config, tree)).toEqual([]);
  });

  test('names unknown nodes and Exceptions that could be Rules', () => {
    expect(
      validateAgainstTree(
        {
          ...config,
          rules: { 'src/ghost': ['src/a'] },
          exceptions: [{ from: 'src/c', to: 'src/a', because: 'why not' }],
        },
        tree,
      ),
    ).toEqual([
      {
        kind: 'path',
        message: 'Rule source is no Module or Wrapper: src/ghost',
      },
    ]);
    expect(
      validateAgainstTree(
        {
          ...config,
          exceptions: [{ from: 'src/c', to: 'src/a', because: 'why not' }],
        },
        tree,
      ),
    ).toEqual([
      {
        kind: 'exception',
        message:
          'Exception src/c -> src/a could be a Rule; declare it under rules',
      },
    ]);
  });
});

describe('reachOf', () => {
  test('inherits every Rule declared above the node', () => {
    expect(reachOf(law, 'src/a/deep').rules).toEqual([
      { from: 'src/a', to: 'src/b/x' },
      { from: 'src/a', to: 'src/lib' },
    ]);
  });
});
