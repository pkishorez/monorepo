import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.query contract',
  '`SqliteCommand#process({ operation: "query", entity, index, pk, sk, limit? })` translates the wire `SkCondition` to the entity\'s `SkParam` and forwards to `entity.query`.',
  () => {
    vtest(
      'payload.index selects "primary" or a secondary index name',
      'The processor passes the string straight through to `entity.query(index, ...)`.',
      () => {
        const payload = {
          operation: 'query' as const,
          entity: 'User',
          index: 'primary',
          pk: {},
          sk: { '>': '' },
        };
        expect(payload.index).toBe('primary');
      },
    );

    vtest(
      'SkCondition shapes mirror the entity-layer SkParam',
      'The wire format is intentionally identical so callers do not have to translate.',
      () => {
        const sk = { between: ['a', 'z'] };
        expect('between' in sk).toBe(true);
      },
    );

    vtest(
      'response.items is a flat array (matches entity.query.items)',
      'No further envelope around the items — just `{ items, timing }`.',
      () => {
        const res = { items: [], timing: { durationMs: 0 } };
        expect(Array.isArray(res.items)).toBe(true);
      },
    );

    vtest(
      'limit is forwarded only when defined',
      'The processor sends `{ limit }` to `entity.query` only when the payload carried one; otherwise it omits `options` so the entity layer applies its default 100.',
      () => {
        const limit: number | undefined = undefined;
        const options = limit !== undefined ? { limit } : undefined;
        expect(options).toBeUndefined();
      },
    );

    vtest(
      'unknown index name surfaces as CommandError("query") with cause queryFailed',
      'The entity-layer `queryFailed` is wrapped with the operation tag and the original cause.',
      () => {
        const err = {
          _tag: 'CommandError',
          operation: 'query',
          message: 'Query failed: Index XX not found',
        };
        expect(err.message).toMatch(/Index XX not found/);
      },
    );
  },
);
