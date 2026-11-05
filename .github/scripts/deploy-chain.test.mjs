import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLOCKED, pending, pick, summary } from './deploy-chain.mjs';

const dirs = ['apps/connect', 'apps/code'];

test('an app deploys when it or a package it bundles changed', () => {
  assert.deepEqual(pick(dirs, ['apps/code/src/a.ts'], ['apps/code']), [
    'apps/code',
  ]);
  assert.deepEqual(
    pick(
      dirs,
      ['toolkits/std-toolkit/src/a.ts'],
      ['toolkits/std-toolkit', 'apps/connect', 'apps/code'],
    ),
    dirs,
  );
  assert.deepEqual(pick(dirs, ['README.md'], []), []);
});

test('the lockfile, the catalog and the workflow deploy every app', () => {
  for (const file of [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.github/workflows/deploy-connect.yml',
  ])
    assert.deepEqual(pick(dirs, [file], []), dirs);
});

test('@kestack/connect is pending when the plan bumps it', () => {
  const plan = (type) => ({
    changesets: [],
    releases: [
      { name: '@kestack/std-toolkit', type: 'patch' },
      { name: '@kestack/connect', type },
    ],
  });
  assert.equal(pending(plan('patch')), true);
  assert.equal(pending(plan('none')), false);
  assert.equal(pending({ changesets: [], releases: [] }), false);
});

const deployed = {
  stage: 'prod',
  ready: true,
  plugins: { result: 'success' },
  connect: { affected: true, result: 'success' },
  frontEnds: [{ name: 'code', affected: true, result: 'success' }],
};

test('the summary has one row per app', () => {
  const text = summary(deployed);
  assert.match(
    text,
    /\| Connect Cloud \| ✅ deployed \| https:\/\/connect\.kishore\.app \|/,
  );
  assert.match(
    text,
    /\| code \| ✅ deployed \| https:\/\/code\.kishore\.app \|/,
  );
});

test('a pending release says so and deploys nothing', () => {
  const text = summary({
    ...deployed,
    ready: false,
    plugins: { result: 'skipped' },
    connect: { affected: true, result: 'skipped' },
    frontEnds: [{ name: 'code', affected: true, result: undefined }],
  });
  assert.ok(text.includes(BLOCKED));
  assert.match(text, /\| code \| ⏭️ not deployed: release pending \|/);
});

test('a front end waits for a Connect Cloud that failed', () => {
  const text = summary({
    ...deployed,
    stage: 'pr7',
    connect: { affected: true, result: 'failure' },
    frontEnds: [{ name: 'code', affected: true, result: undefined }],
  });
  assert.match(text, /\| Connect Cloud \| ❌ failed \| https:\/\/pr7-connect/);
  assert.match(
    text,
    /\| code \| ⏭️ not deployed: Connect Cloud did not deploy \|/,
  );
});

test('Connect Cloud deploys before a front end even when it did not change', () => {
  const text = summary({
    ...deployed,
    connect: { affected: false, result: 'success' },
  });
  assert.match(text, /\| Connect Cloud \| ✅ deployed \|/);
  assert.match(text, /\| code \| ✅ deployed \|/);
});

test('a change to a front end alone says what stopped the chain', () => {
  const text = summary({
    ...deployed,
    plugins: { result: 'failure' },
    connect: { affected: false, result: 'skipped' },
    frontEnds: [{ name: 'code', affected: true, result: undefined }],
  });
  assert.match(
    text,
    /\| Connect Cloud \| ⏭️ not deployed: the Plugins check failed \|/,
  );
  assert.match(
    text,
    /\| code \| ⏭️ not deployed: Connect Cloud did not deploy \|/,
  );
});

test('nothing changed says so', () => {
  const text = summary({
    ...deployed,
    plugins: { result: 'skipped' },
    connect: { affected: false, result: 'skipped' },
    frontEnds: [{ name: 'code', affected: false, result: undefined }],
  });
  assert.match(text, /\| Connect Cloud \| ⏭️ unchanged, skipped \|/);
  assert.match(text, /\| code \| ⏭️ unchanged, skipped \|/);
});
