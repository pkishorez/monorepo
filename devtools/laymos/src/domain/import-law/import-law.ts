import type {
  Config,
  ConfigException,
  ConfigValidationIssue,
  ImportVerdict,
  ModuleImport,
  ModuleTree,
  Rule,
} from '../../architecture-analysis-schema/index.js';
import { isAncestor, nodeByPath } from '../module-tree/index.js';
import {
  contains,
  overlaps,
  sharedRuleSource,
} from '../project-config/index.js';

/**
 * The Rules as concrete pairs: a Shared Rule `* -> t` becomes one Rule from
 * every sibling of `t`.
 */
export function expandRules(config: Config, tree: ModuleTree): readonly Rule[] {
  const rules: Rule[] = [];
  for (const [from, targets] of Object.entries(config.rules)) {
    for (const to of targets) {
      if (from !== sharedRuleSource) {
        rules.push({ from, to });
        continue;
      }
      const parent = nodeByPath(tree, to)?.parent;
      if (parent === undefined) continue;
      for (const sibling of nodeByPath(tree, parent)?.children ?? []) {
        if (sibling !== to) rules.push({ from: sibling, to });
      }
    }
  }
  return rules;
}

/**
 * A Rule loop: Rules that, followed together with folder nesting, let a
 * Module reach itself. Rule `a` leads to Rule `b` when `a.to` and `b.from`
 * overlap, because the Module they share may import through `a` and be
 * imported through `b`. Each loop is reported once, as the Rules on it.
 */
export function findRuleLoops(rules: readonly Rule[]): readonly Rule[][] {
  const edges = rules.map((rule) =>
    rules.flatMap((next, index) =>
      overlaps(rule.to, next.from) ? [index] : [],
    ),
  );
  const loops: Rule[][] = [];
  const state: ('new' | 'open' | 'done')[] = rules.map(() => 'new');
  const stack: number[] = [];
  const visit = (index: number): void => {
    state[index] = 'open';
    stack.push(index);
    for (const next of edges[index]!) {
      if (state[next] === 'done') continue;
      if (state[next] === 'open') {
        const loop = stack.slice(stack.indexOf(next)).map((i) => rules[i]!);
        if (!loops.some((known) => sameLoop(known, loop))) loops.push(loop);
        continue;
      }
      visit(next);
    }
    stack.pop();
    state[index] = 'done';
  };
  rules.forEach((_, index) => {
    if (state[index] === 'new') visit(index);
  });
  return loops;
}

export function wouldLoop(rules: readonly Rule[], candidate: Rule): boolean {
  return findRuleLoops([...rules, candidate]).some((loop) =>
    loop.includes(candidate),
  );
}

/**
 * What can only be checked once the tree is known: every Rule and Exception
 * names a node, the Rules make no loop, and every Exception is one a Rule
 * could not hold.
 */
export function validateAgainstTree(
  config: Config,
  tree: ModuleTree,
): readonly ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const known = (path: string) => nodeByPath(tree, path) !== undefined;
  for (const [from, targets] of Object.entries(config.rules)) {
    if (from !== sharedRuleSource && !known(from)) {
      issues.push({
        kind: 'path',
        message: `Rule source is no Module or Wrapper: ${from}`,
      });
    }
    for (const to of targets) {
      if (!known(to)) {
        issues.push({
          kind: 'path',
          message: `Rule target is no Module or Wrapper: ${to}`,
        });
      }
    }
  }
  for (const { from, to } of config.exceptions) {
    for (const path of [from, to]) {
      if (!known(path)) {
        issues.push({
          kind: 'path',
          message: `Exception names no Module or Wrapper: ${path}`,
        });
      }
    }
  }
  if (issues.length > 0) return issues;

  const rules = expandRules(config, tree);
  for (const loop of findRuleLoops(rules)) {
    issues.push({
      kind: 'loop',
      message: `Rule loop: ${[...loop, loop[0]!].map(({ from }) => from).join(' -> ')}`,
    });
  }
  for (const exception of config.exceptions) {
    if (
      !overlaps(exception.from, exception.to) &&
      !wouldLoop(rules, { from: exception.from, to: exception.to })
    ) {
      issues.push({
        kind: 'exception',
        message: `Exception ${exception.from} -> ${exception.to} could be a Rule; declare it under rules`,
      });
    }
  }
  return issues;
}

export interface ImportLaw {
  readonly tree: ModuleTree;
  readonly rules: readonly Rule[];
  readonly exceptions: readonly ConfigException[];
}

/**
 * The verdict on one import between two different nodes. Returns undefined
 * for an import inside one Module, which is always free.
 */
export function judgeImport(
  law: ImportLaw,
  fromFile: string,
  toFile: string,
): ModuleImport | undefined {
  const fromModule = law.tree.owners[fromFile];
  const toModule = law.tree.owners[toFile];
  if (fromModule === undefined || toModule === undefined) return undefined;
  if (fromModule === toModule) return undefined;
  return {
    fromFile,
    fromModule,
    toFile,
    toModule,
    verdict: verdictFor(law, fromModule, toFile, toModule),
  };
}

function verdictFor(
  law: ImportLaw,
  fromModule: string,
  toFile: string,
  toModule: string,
): ImportVerdict {
  const from = nodeByPath(law.tree, fromModule);
  const to = nodeByPath(law.tree, toModule);
  if (from?.kind !== 'module' || to?.kind !== 'module') {
    return { kind: 'violation', reason: 'uncovered', remedy: 'none' };
  }
  if (to.index !== toFile) {
    return { kind: 'violation', reason: 'not-index', remedy: 'none' };
  }
  if (isAncestor(fromModule, toModule)) return { kind: 'nested' };

  const exception = law.exceptions.find(
    (candidate) =>
      contains(candidate.from, fromModule) && contains(candidate.to, toModule),
  );
  if (isAncestor(toModule, fromModule)) {
    return exception === undefined
      ? { kind: 'violation', reason: 'ancestor', remedy: 'exception' }
      : { kind: 'exception', exception };
  }
  const rule = law.rules.find(
    (candidate) =>
      contains(candidate.from, fromModule) && contains(candidate.to, toModule),
  );
  if (rule !== undefined) return { kind: 'rule', rule };
  if (exception !== undefined) return { kind: 'exception', exception };
  return wouldLoop(law.rules, { from: fromModule, to: toModule })
    ? { kind: 'violation', reason: 'against-rule', remedy: 'exception' }
    : { kind: 'violation', reason: 'no-rule', remedy: 'rule' };
}

export interface Reach {
  readonly rules: readonly Rule[];
  readonly exceptions: readonly ConfigException[];
}

/** Everything a node may import by Rule and Exception, inherited from above. */
export function reachOf(law: ImportLaw, path: string): Reach {
  return {
    rules: law.rules.filter(({ from }) => contains(from, path)),
    exceptions: law.exceptions.filter(({ from }) => contains(from, path)),
  };
}

function sameLoop(left: readonly Rule[], right: readonly Rule[]): boolean {
  return (
    left.length === right.length && left.every((rule) => right.includes(rule))
  );
}
