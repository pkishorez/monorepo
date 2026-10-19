import { expect, it } from 'vitest';
import { sendable } from './socket.ts';

it('answers a close with a code a close frame may carry', () => {
  expect(sendable(1005)).toBe(1000);
  expect(sendable(1006)).toBe(1000);
  expect(sendable(1015)).toBe(1000);
  expect(sendable(1001)).toBe(1001);
  expect(sendable(4000)).toBe(4000);
});
