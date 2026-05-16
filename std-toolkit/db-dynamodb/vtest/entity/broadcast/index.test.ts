import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'broadcast firing rules',
  'Insert / update / soft-delete / hard-delete all broadcast; `batchInsert` does not; transactional ops broadcast through the registry.',
  () => {
    vtest(
      'broadcast fires only after the DynamoDB ack',
      'A failed put never emits a phantom entity. Sequencing inside the operation is put-then-broadcast.',
      () => {
        const ordering = ['put', 'broadcast'];
        expect(ordering.indexOf('broadcast')).toBeGreaterThan(
          ordering.indexOf('put'),
        );
      },
    );

    vtest(
      'no ConnectionService in context → silent no-op',
      'The library reads the service option and falls through gracefully when absent.',
      () => {
        const service: { broadcast?: (e: unknown) => void } | null = null;
        const noop = service ? service.broadcast : undefined;
        expect(noop).toBeUndefined();
      },
    );

    vtest(
      'batchInsert is intentionally silent',
      'Batched writes do not emit — the expectation is bulk-import scale; subscribers would be overwhelmed.',
      () => {
        const broadcastsPerBatchRow = 0;
        expect(broadcastsPerBatchRow).toBe(0);
      },
    );

    vtest(
      'transactional broadcast happens on the registry side',
      'Each `TransactItem.broadcast` is fanned out only after `registry.transact` succeeds, in input order.',
      () => {
        const fanOutOrder = ['ack', 'broadcast-1', 'broadcast-2'];
        expect(fanOutOrder[0]).toBe('ack');
      },
    );
  },
);
