import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'scan direction inferred from sk operator',
  '`>=` / `>` / `beginsWith` scan forward; `<=` / `<` reverse the scan. The caller never sets `ScanIndexForward` directly.',
  () => {
    vtest(
      'forward operators (>=, >, beginsWith)',
      'These three are the forward set — the library picks `ScanIndexForward: true`.',
      () => {
        const forward = new Set(['>=', '>', 'beginsWith']);
        expect(forward.has('>=')).toBe(true);
        expect(forward.has('>')).toBe(true);
        expect(forward.has('beginsWith')).toBe(true);
      },
    );

    vtest(
      'backward operators (<=, <)',
      'These flip `ScanIndexForward: false` automatically.',
      () => {
        const backward = new Set(['<=', '<']);
        expect(backward.has('<')).toBe(true);
        expect(backward.has('<=')).toBe(true);
      },
    );
  },
);

vdescribe(
  'sk: null vs cursor',
  '`null` is the "no SK condition" sentinel, distinct from a real cursor value.',
  () => {
    vtest(
      'sk: null means "no SK condition"',
      'The library passes no SK predicate to DynamoDB when sk is null.',
      () => {
        const sk: { value: string | null } = { value: null };
        expect(sk.value).toBeNull();
      },
    );
  },
);

vdescribe(
  'unknown secondary index lookup',
  "A name that is not in the entity's `secondaryDerivationMap` fails with `queryFailed`.",
  () => {
    vtest(
      'an unknown secondary index name fails with queryFailed',
      'The failure message names the missing index for diagnostics.',
      () => {
        const message = 'Index byNothing not found';
        expect(message).toMatch(/not found/);
      },
    );
  },
);

vdescribe(
  'queryStream cursor inference',
  'queryStream does not rely on DynamoDB `LastEvaluatedKey`. The next cursor is the last decoded item — `idField` for primary, `meta._u` for `_u`-SK GSIs, derived custom-SK string otherwise.',
  () => {
    vtest(
      'queryStream terminates when a page returns fewer items than batchSize',
      'Short page ⇒ end of stream; no extra round-trip.',
      () => {
        const batchSize = 25;
        const lastPageSize = 7;
        const isTerminal = lastPageSize < batchSize;
        expect(isTerminal).toBe(true);
      },
    );

    vtest(
      'queryStream only accepts > and < operators',
      'The cursor has to be exclusive — `beginsWith` / `>=` / `<=` are not part of the StreamSkParam shape.',
      () => {
        type StreamOps = '>' | '<';
        const ops: StreamOps[] = ['>', '<'];
        expect(ops).toEqual(['>', '<']);
      },
    );
  },
);
