import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shard } from './test-plan.mjs';

const names = [
  'apps/code',
  'apps/connect',
  'apps/docs',
  'apps/kabuki-start',
  'devtools/laymos',
  'new/workspace',
  'toolkits/auth-toolkit',
  'toolkits/std-toolkit',
];

test('every workspace lands in exactly one shard', () => {
  for (const count of [1, 2, 3, 4, 12]) {
    const shards = shard(names, count);
    assert.equal(shards.length, count);
    assert.deepEqual(shards.flat().sort(), [...names].sort());
  }
});

test('the slowest workspaces are spread across shards', () => {
  const shards = shard(names, 3);
  for (const slow of ['apps/code', 'apps/connect', 'apps/kabuki-start'])
    assert.equal(shards.filter((names) => names.includes(slow)).length, 1);
  assert.notDeepEqual(
    shards.findIndex((names) => names.includes('apps/code')),
    shards.findIndex((names) => names.includes('apps/connect')),
  );
});

test('the same workspaces always make the same shards', () => {
  assert.deepEqual(shard(names, 4), shard([...names].reverse(), 4));
});
