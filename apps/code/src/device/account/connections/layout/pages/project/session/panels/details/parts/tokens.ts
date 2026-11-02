/*
 * Tokens as people say them, and how full a context of them is: the one
 * way the Draft and a session's details write and judge them.
 */

/** Tokens as people say them: 980, 61K, 1.2M, 1M. */
export const tokens = (n: number) =>
  n >= 1e6
    ? `${Number((n / 1e6).toFixed(1))}M`
    : n >= 1e3
      ? `${Math.round(n / 1e3)}K`
      : `${Math.round(n)}`;

/** How full: room left, filling from 80%, full from 95%. */
export type Level = 'fine' | 'filling' | 'full';

export const levelOf = (used: number, max: number): Level => {
  const fraction = max <= 0 ? 0 : used / max;
  return fraction >= 0.95 ? 'full' : fraction >= 0.8 ? 'filling' : 'fine';
};
