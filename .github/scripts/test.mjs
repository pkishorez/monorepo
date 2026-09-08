import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { renderSummary } from './test-summary.mjs';

const root = process.cwd();
const workspaces = JSON.parse(
  execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    encoding: 'utf8',
  }),
);
const directory = mkdtempSync(join(tmpdir(), 'monorepo-test-reports-'));
const results = [];
try {
  for (const workspace of workspaces) {
    if (workspace.path === root) continue;
    const manifest = JSON.parse(
      readFileSync(join(workspace.path, 'package.json'), 'utf8'),
    );
    if (!manifest.scripts?.test) continue;

    const name = relative(root, workspace.path);
    const summaryPath = join(directory, `${results.length}.md`);
    console.log(`::group::${name}`);
    // Keep native annotations, but collect each report separately so concurrent
    // reporters cannot append unnamed summaries to the job summary.
    const result = spawnSync('pnpm', ['run', 'test'], {
      cwd: workspace.path,
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
