import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plan } from './test-plan.mjs';
import { renderSummary } from './test-summary.mjs';

const root = process.cwd();
const names = plan(root);
console.log(`Testing ${names.length} workspaces:\n  ${names.join('\n  ')}`);
// With --plan, only report how many there are, so CI can skip a job's setup,
// and the filter that builds just them and what they depend on.
if (process.argv.includes('--plan')) {
  const filters = names.map((name) => `--filter '{${name}}...'`).join(' ');
  appendFileSync(
    process.env.GITHUB_OUTPUT ?? '/dev/null',
    `count=${names.length}\nfilters=${filters}\n`,
  );
  process.exit(0);
}
const directory = mkdtempSync(join(tmpdir(), 'monorepo-test-reports-'));
const results = [];
try {
  for (const name of names) {
    const summaryPath = join(directory, `${results.length}.md`);
    console.log(`::group::${name}`);
    // Keep native annotations, but collect each report separately so concurrent
    // reporters cannot append unnamed summaries to the job summary.
    const result = spawnSync('pnpm', ['run', 'test'], {
      cwd: join(root, name),
      stdio: 'inherit',
      env: { ...process.env, CI: 'true', GITHUB_STEP_SUMMARY: summaryPath },
    });
    if (result.error) console.error(result.error);
    console.log('::endgroup::');
    let report = '';
    try {
      report = readFileSync(summaryPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    results.push({ name, passed: result.status === 0, report });
    // Continue after failures so every workspace appears in the report.
  }
} finally {
  const summary = renderSummary(results);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  rmSync(directory, { recursive: true, force: true });
}
if (results.length === 0 || results.some((result) => !result.passed))
  process.exitCode = 1;
