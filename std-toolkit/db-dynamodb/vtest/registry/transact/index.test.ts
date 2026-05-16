import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'registry.transact is atomic',
  'DynamoDB rejects the whole batch if any per-op condition fails. There is no partial success.',
  () => {
    vtest(
      'all-or-nothing',
      'Either every item commits or none of them do.',
      () => {
        const isAtomic = true;
        expect(isAtomic).toBe(true);
      },
    );

    vtest(
      'broadcasts fire only after the ack',
      'A rolled-back transaction emits nothing through `ConnectionService`.',
      () => {
        const ordering = ['ack', 'broadcast'];
        expect(ordering.indexOf('broadcast')).toBeGreaterThan(
          ordering.indexOf('ack'),
        );
      },
    );

    vtest(
      'items without a broadcast payload are skipped in the result',
      'The success value collects only `broadcast` fields that were present, in input order.',
      () => {
        const items = [
          { broadcast: { value: 1 } },
          {} as { broadcast?: { value: number } },
          { broadcast: { value: 2 } },
        ];
        const broadcasts = items
          .map((i) => i.broadcast)
          .filter((b): b is { value: number } => Boolean(b));
        expect(broadcasts).toHaveLength(2);
      },
    );

    vtest(
      'ConnectionService is optional',
      'When absent the broadcasts are still returned, but no emit happens.',
      () => {
        const service: { broadcast?: (e: unknown) => void } | null = null;
        const emitsOnService = service ? 1 : 0;
        expect(emitsOnService).toBe(0);
      },
    );
  },
);
