import * as colors from 'yoctocolors';

import type {
  ModuleAnalysis,
  ModuleViolation,
} from '../../../domain/architecture-analysis/modules/index.js';

const headings: Readonly<Record<ModuleViolation['kind'], string>> = {
  coverage: 'unassigned files',
  'graph-coverage': 'files below a Module Graph with no member',
  'missing-entry-point': 'missing Module entry points',
  dependency: 'forbidden Module dependencies',
  boundary: 'internal Module imports',
  cycle: 'Module cycles',
  'unused-shared': 'unused Shared Modules',
  'dead-module': 'Modules nothing may import',
};

type ModuleReportInput = Pick<
  ModuleAnalysis,
  'modules' | 'graphs' | 'violations'
>;

export function renderModuleReport(result: ModuleReportInput): string {
  const summary = renderSummary(result.modules, result.graphs);
  if (result.violations.length === 0) {
    return [summary, colors.green('✓ No Module violations')].join('\n');
  }
  const sections = [summary, '', colors.red('Module violations')];
  for (const kind of Object.keys(headings) as ModuleViolation['kind'][]) {
    const violations = result.violations.filter(
      (violation) => violation.kind === kind,
    );
    if (violations.length === 0) continue;
    sections.push('', headings[kind], ...violations.map(renderViolation));
  }
  sections.push(
    '',
    `${result.violations.length} ${result.violations.length === 1 ? 'violation' : 'violations'}`,
  );
  return sections.join('\n');
}

function renderSummary(
  modules: ModuleAnalysis['modules'],
  graphs: ModuleAnalysis['graphs'],
): string {
  const sharedByLayer = new Map<string, number>();
  let shared = 0;
  let exposed = 0;
  let members = 0;
  for (const module of modules) {
    if (module.exposed) exposed += 1;
    if (module.graph !== undefined) members += 1;
    if (!module.shared) continue;
    shared += 1;
    sharedByLayer.set(module.layer, (sharedByLayer.get(module.layer) ?? 0) + 1);
  }
  const layers = [...sharedByLayer]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([layer, count]) => `${layer} ${count}`)
    .join(', ');
  return [
    `Modules: ${modules.length} (${shared} Shared, ${exposed} exposed, ${members} in a Module Graph)`,
    `Module Graphs: ${graphs.length}`,
    `Shared by Layer: ${layers || 'none'}`,
  ].join('\n');
}

function renderViolation(violation: ModuleViolation): string {
  switch (violation.kind) {
    case 'coverage':
      return `  ${colors.yellow('✕')} ${violation.file}`;
    case 'graph-coverage':
      return `  ${colors.yellow('✕')} ${violation.graph}: ${violation.file}`;
    case 'missing-entry-point':
      return `  ${colors.red('✕')} Missing Module entry point: ${violation.path}`;
    case 'dependency':
    case 'boundary':
      return `  ${colors.red('✕')} ${violation.fromModule} → ${violation.toModule}: ${violation.fromFile} → ${violation.toFile}`;
    case 'cycle':
      return `  ${colors.red('✕')} ${violation.modules.join(' → ')} → ${violation.modules[0]}`;
    case 'unused-shared':
    case 'dead-module':
      return `  ${colors.red('✕')} ${violation.module}`;
  }
}
