import * as colors from 'yoctocolors';

import type {
  SelfContainedViolation,
  StoryTellingIssue,
} from '../../../orchestrator/run-stories/index.js';

export function renderSelfContainedReport(
  violations: readonly SelfContainedViolation[],
): string {
  if (violations.length === 0) {
    return colors.green('✓ Every Proof is Self-contained');
  }
  return [
    colors.red('Proofs with relative imports'),
    '',
    ...violations.map(
      ({ id, specifier }) =>
        `  ${colors.yellow('✕')} ${id} ${colors.dim('imports')} ${specifier}`,
    ),
    '',
    `${violations.length} ${violations.length === 1 ? 'import' : 'imports'}`,
  ].join('\n');
}

export function renderTellingReport(
  issues: readonly StoryTellingIssue[],
): string {
  if (issues.length === 0) {
    return colors.green('✓ Every Story tells itself');
  }
  return [
    colors.red('Telling issues'),
    '',
    ...issues.map(
      ({ story, issue }) =>
        `  ${colors.yellow('✕')} ${story} ${colors.dim(issue.kind)} ${issue.message}`,
    ),
    '',
    `${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`,
  ].join('\n');
}
