import * as colors from 'yoctocolors';

import type {
  ModuleAnalysis,
  ModuleViolation,
} from '../../../domain/architecture-analysis/modules/index.js';

const headings: Readonly<Record<ModuleViolation['kind'], string>> = {
  coverage: 'unassigned files',
  'missing-entry-point': 'missing Module entry points',
  dependency: 'forbidden Module dependencies',
  boundary: 'internal Module imports',
  cycle: 'Module cycles',
  'unused-shared': 'unused Shared Modules',
};

type ModuleReportInput = Pick<ModuleAnalysis, 'modules' | 'violations'>;

export function renderModuleReport(result: ModuleReportInput): string {
  const summary = renderSummary(result.modules);
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

function renderSummary(modules: ModuleAnalysis['modules']): string {
  const kinds = { normal: 0, shared: 0, entry: 0 };
  const sharedByLayer = new Map<string, number>();
  for (const module of modules) {
    kinds[module.kind] += 1;
    if (module.kind !== 'shared') continue;
    sharedByLayer.set(module.layer, (sharedByLayer.get(module.layer) ?? 0) + 1);
  }
  const layers = [...sharedByLayer]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([layer, count]) => `${layer} ${count}`)
    .join(', ');
  return [
    `Modules: ${modules.length} (${kinds.normal} Normal, ${kinds.shared} Shared, ${kinds.entry} Entry)`,
    `Shared by Layer: ${layers || 'none'}`,
  ].join('\n');
}

function renderViolation(violation: ModuleViolation): string {
  switch (violation.kind) {
    case 'coverage':
      return `  ${colors.yellow('✕')} ${violation.file}`;
    case 'missing-entry-point':
      return `  ${colors.red('✕')} Missing Module entry point: ${violation.path}`;
    case 'dependency':
    case 'boundary':
      return `  ${colors.red('✕')} ${violation.fromModule} → ${violation.toModule}: ${violation.fromFile} → ${violation.toFile}`;
    case 'cycle':
      return `  ${colors.red('✕')} ${violation.modules.join(' → ')} → ${violation.modules[0]}`;
    case 'unused-shared':
      return `  ${colors.red('✕')} ${violation.module}`;
  }
}
