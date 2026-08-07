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
};

type ModuleReportInput = Pick<ModuleAnalysis, 'violations'>;

export function renderModuleReport(result: ModuleReportInput): string {
  if (result.violations.length === 0) {
    return colors.green('✓ No Module violations');
  }
  const sections = [colors.red('Module violations')];
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
  }
}
