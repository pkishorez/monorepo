import { expect, it } from 'vitest';
import { vtest } from '@monorepo/vtest';

vtest('accepts a valid widget', 'a valid widget passes validation', () => {
  expect(true).toBe(true);
});

vtest('rejects an empty widget', 'an empty widget fails validation', () => {
  expect('').toHaveLength(1);
});

it.skip('handles legacy widgets', () => {
  expect(true).toBe(true);
});
