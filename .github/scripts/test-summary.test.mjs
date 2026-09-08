import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderSummary } from './test-summary.mjs';

test('labels workspace counts in one summary and preserves failed commands', () => {
  const report = `## Vitest Test Report

### Summary

- **Test Files**: ✅ **4 passes** · 4 total
- **Test Results**: ✅ **36 passes** · 36 total
- **Other**: 1 skip · 1 total
`;
  const summary = renderSummary([
    { name: 'apps/console', passed: true, report },
    // A smoke test or unhandled error may fail after Vitest reports passing tests.
    { name: 'devtools/server', passed: false, report },
    { name: 'toolkits/broken', passed: false, report: '' },
  ]);
  assert.match(summary, /1\/3 workspaces passed/);
  assert.match(summary, /apps\/console \| ✅ Passed \| ✅ \*\*4 passes/);
  assert.match(summary, /devtools\/server \| ❌ Failed/);
  assert.match(summary, /toolkits\/broken \| ❌ Failed \| — \| — \| —/);
  assert.match(summary, /1 skip · 1 total/);
  assert.equal(summary.match(/^## /gm).length, 1);
  assert.doesNotMatch(summary, /Vitest Test Report/);
});
