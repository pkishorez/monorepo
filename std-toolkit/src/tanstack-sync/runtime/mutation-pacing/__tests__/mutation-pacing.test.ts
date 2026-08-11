import type { Transaction } from '@tanstack/react-db';
import { describe, expect, it } from 'vitest';
import { coalesceStrategy } from '../index.js';

const transaction = (persisted: Promise<unknown>): Transaction =>
  ({ isPersisted: { promise: persisted } }) as Transaction;

describe('TanStack Sync', () => {
  describe('coalesce pacing', () => {
    it('retains pending work after a failed in-flight request', async () => {
      const first = Promise.withResolvers<void>();
      const third = Promise.withResolvers<void>();
      const executed: string[] = [];
      const strategy = coalesceStrategy();

      strategy.execute(() => {
        executed.push('first');
        return transaction(first.promise);
      });
      strategy.execute(() => {
        executed.push('pending');
        return transaction(Promise.resolve());
      });

      first.reject(new Error('request failed'));
      await Promise.resolve();
      expect(executed).toEqual(['first']);

      strategy.execute(() => {
        executed.push('retry');
        return transaction(third.promise);
      });
      expect(executed).toEqual(['first', 'retry']);

      third.resolve();
      strategy.cleanup();
    });
  });
});
