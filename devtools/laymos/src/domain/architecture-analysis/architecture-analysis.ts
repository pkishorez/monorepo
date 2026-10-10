import type {
  ArchitectureAnalysis,
  Config,
  Finding,
  ModuleImport,
} from '../../architecture-analysis-schema/index.js';
import type { FileGraph } from '../file-graph/index.js';
import { expandRules, judgeImport } from '../import-law/index.js';
import { buildModuleTree } from '../module-tree/index.js';

export function analyzeArchitecture(
  fileGraph: FileGraph,
  config: Config,
): ArchitectureAnalysis {
  const tree = buildModuleTree(fileGraph.keys(), config.fileModules);
  const law = {
    tree,
    rules: expandRules(config, tree),
    exceptions: config.exceptions,
  };

  const imports: ModuleImport[] = [];
  for (const [fromFile, targets] of fileGraph) {
    for (const toFile of targets) {
      const judged = judgeImport(law, fromFile, toFile);
      if (judged !== undefined) imports.push(judged);
    }
  }

  const findings: Finding[] = [];
  for (const node of tree.nodes) {
    if (node.kind !== 'wrapper') continue;
    for (const file of node.ownFiles) {
      findings.push({ kind: 'wrapper-coverage', file });
    }
  }
  const usedRules = new Set(
    imports.flatMap(({ verdict }) =>
      verdict.kind === 'rule' ? [verdict.rule] : [],
    ),
  );
  for (const rule of law.rules) {
    if (!usedRules.has(rule)) findings.push({ kind: 'unused-rule', rule });
  }
  const usedExceptions = new Set(
    imports.flatMap(({ verdict }) =>
      verdict.kind === 'exception' ? [verdict.exception] : [],
    ),
  );
  for (const exception of law.exceptions) {
    if (!usedExceptions.has(exception)) {
      findings.push({ kind: 'unused-exception', exception });
    }
  }

  return { config, tree, imports, findings };
}

export function violationsOf(
  analysis: Pick<ArchitectureAnalysis, 'imports'>,
): readonly ModuleImport[] {
  return analysis.imports.filter(({ verdict }) => verdict.kind === 'violation');
}
