// Minimal test utilities for Effect DynamoDB tests
// Consolidated from the previous verbose utils.ts

export const STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
} as const;

// Simple factory functions for common test data
export function createSimpleItem(
  id: string,
  overrides: Record<string, any> = {},
) {
  return {
    pkey: `item#${id}`,
    skey: 'data',
    name: `Item ${id}`,
    status: STATUS.ACTIVE,
    ...overrides,
  };
}

export function createKey(pkey: string, skey: string = 'data') {
  return {
    pkey,
    skey,
  };
}

// Assertion helpers
export function expectItemCount(items: any[], expectedCount: number): void {
  expect(items).toHaveLength(expectedCount);
}

export function expectAllItemsMatch<T>(
  items: T[],
  predicate: (item: T) => boolean,
): void {
  expect(items.every(predicate)).toBe(true);
}

// Re-export table instance from setup for convenience
export { table } from '../setup.js';

