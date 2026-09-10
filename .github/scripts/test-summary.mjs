export function renderSummary(results) {
  const rows = results.map(({ name, passed, report }) => {
    const stat = (label) =>
      report.match(new RegExp(`^- \\*\\*${label}\\*\\*: (.+)$`, 'm'))?.[1] ??
      '—';
    return `| ${name} | ${passed ? '✅ Passed' : '❌ Failed'} | ${stat('Test Files')} | ${stat('Test Results')} | ${stat('Other')} |`;
  });
  return [
    '## Monorepo tests',
    '',
    `${results.filter((result) => result.passed).length}/${results.length} workspaces passed.`,
    '',
    '| Workspace | Result | Test files | Tests | Skipped / todo |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'Results include each workspace’s full test command. Failure details and annotations are in the job log.',
    '',
  ].join('\n');
}
