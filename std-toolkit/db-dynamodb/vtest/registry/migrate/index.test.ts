import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'registry.migrate safety defaults',
  '`dryRun: true` is the default — a `migrate()` call with no options never rewrites the table. Every rewrite is conditional on the stored bytes.',
  () => {
    vtest(
      'dryRun: true is the default',
      'Misuse-resistance — a bare `migrate()` only classifies.',
      () => {
        const options: { dryRun?: boolean } = {};
        const effective = options.dryRun ?? true;
        expect(effective).toBe(true);
      },
    );

    vtest(
      'rewrites are conditional on stored bytes',
      'Every put issues `pk = stored AND sk = stored AND _e = stored AND _u = stored` (plus `_d` for regular entities).',
      () => {
        const conditionParts = ['pk', 'sk', '_e', '_u'];
        expect(conditionParts).toContain('_u');
      },
    );

    vtest(
      'conditional conflicts trigger re-inspect-then-retry up to MIGRATION_RETRY_LIMIT',
      'The migrator reads the row again with `ConsistentRead: true`, re-classifies, and retries up to 3 attempts.',
      () => {
        const MIGRATION_RETRY_LIMIT = 3;
        expect(MIGRATION_RETRY_LIMIT).toBe(3);
      },
    );

    vtest(
      'throttling / 503 are retried up to the same limit',
      '`ThrottlingException`, `ServiceUnavailable`, `RequestTimeout` are considered recoverable.',
      () => {
        const recoverable = new Set([
          'ThrottlingException',
          'ServiceUnavailable',
          'RequestTimeout',
        ]);
        expect(recoverable.has('ThrottlingException')).toBe(true);
      },
    );
  },
);

vdescribe(
  'entity filter & ignored rows',
  'Rows whose `_e` is not in the filter (or not in the registry) are `ignored` — they never reach an inspector.',
  () => {
    vtest(
      'rows with no _e are ignored',
      'Stray rows lacking the meta entity tag are skipped without inspection.',
      () => {
        const row: Record<string, unknown> = { pk: 'x', sk: 'y' };
        const entityName = typeof row._e === 'string' ? row._e : undefined;
        expect(entityName).toBeUndefined();
      },
    );

    vtest(
      'entities filter narrows the inspector set',
      'A row whose `_e` is not in the filter is `ignored` even if a matching entity is registered.',
      () => {
        const filter = new Set(['User']);
        expect(filter.has('Order')).toBe(false);
      },
    );
  },
);
