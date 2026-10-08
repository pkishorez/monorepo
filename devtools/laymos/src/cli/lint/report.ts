import * as colors from 'yoctocolors';

import type {
  ArchitectureAnalysis,
  ModuleImport,
} from '../../architecture-analysis-schema/index.js';
import { violationsOf } from '../../domain/architecture-analysis/index.js';

export function renderLintReport(analysis: ArchitectureAnalysis): string {
  const modules = analysis.tree.nodes.filter(({ kind }) => kind === 'module');
  const wrappers = analysis.tree.nodes.filter(({ kind }) => kind === 'wrapper');
  const violations = violationsOf(analysis);
  const coverage = analysis.findings.flatMap((finding) =>
    finding.kind === 'wrapper-coverage' ? [finding.file] : [],
  );
  const unusedRules = analysis.findings.flatMap((finding) =>
    finding.kind === 'unused-rule' ? [finding.rule] : [],
  );
  const unusedExceptions = analysis.findings.flatMap((finding) =>
    finding.kind === 'unused-exception' ? [finding.exception] : [],
  );
  const sections = [
    `Modules: ${modules.length} in ${wrappers.length} ${wrappers.length === 1 ? 'Wrapper' : 'Wrappers'}`,
    `Rules: ${Object.values(analysis.config.rules).flat().length}   Exceptions: ${analysis.config.exceptions.length}`,
  ];

  if (violations.length === 0 && coverage.length === 0) {
    sections.push(colors.green('✓ Every import obeys the Rules'));
  } else {
    if (coverage.length > 0) {
      sections.push(
        '',
        colors.red('Files no Module owns'),
        ...coverage.map((file) => `  ${colors.yellow('✕')} ${file}`),
        colors.dim(
          '  give the folder an index file, declare the file under fileModules, or ignore it',
        ),
      );
    }
    if (violations.length > 0) {
      sections.push(
        '',
        colors.red('Violations'),
        ...violations.map(renderViolation),
      );
    }
    const count = violations.length + coverage.length;
    sections.push('', `${count} ${count === 1 ? 'violation' : 'violations'}`);
  }

  if (unusedRules.length > 0 || unusedExceptions.length > 0) {
    sections.push(
      '',
      colors.yellow('Declared but unused'),
      ...unusedRules.map(
        ({ from, to }) => `  ${colors.dim('rule')} ${from} → ${to}`,
      ),
      ...unusedExceptions.map(
        ({ from, to }) => `  ${colors.dim('exception')} ${from} → ${to}`,
      ),
    );
  }
  return sections.join('\n');
}

function renderViolation(violation: ModuleImport): string {
  const { verdict } = violation;
  if (verdict.kind !== 'violation') return '';
  const line = `  ${colors.red('✕')} ${violation.fromModule} → ${violation.toModule}: ${violation.fromFile} → ${violation.toFile}`;
  return `${line}\n    ${colors.dim(remedyText(verdict.reason, verdict.remedy))}`;
}

function remedyText(
  reason: Extract<ModuleImport['verdict'], { kind: 'violation' }>['reason'],
  remedy: Extract<ModuleImport['verdict'], { kind: 'violation' }>['remedy'],
): string {
  switch (reason) {
    case 'no-rule':
      return 'no Rule covers it; declare one under rules';
    case 'against-rule':
      return 'a Rule would make a loop; declare an Exception with a Reason';
    case 'ancestor':
      return 'a child importing its parent; declare an Exception with a Reason, or move the child out';
    case 'not-index':
      return 'reaches a file that is no Index; import the Module through its index file';
    case 'uncovered':
      return remedy === 'none'
        ? 'one side belongs to no Module; see the files no Module owns'
        : '';
  }
}
