import type { Payload, Verdict } from './types';

export const FAIL: Verdict = { type: 'fail' };
export const WAIT: Verdict = { type: 'wait' };

export const waitUntil = (deadline: number): Verdict => ({
  type: 'wait',
  deadline,
});

export const track = (event: Payload): Verdict => ({ type: 'track', event });
export const end = (event: Payload): Verdict => ({ type: 'end', event });
