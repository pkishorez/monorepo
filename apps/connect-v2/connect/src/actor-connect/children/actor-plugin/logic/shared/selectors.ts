const MOST_BACKOFF = 60_000;

const STEADY = 60_000;

export const backoffAfter = (crashes: number, first: number) =>
  Math.min(first * 2 ** Math.max(0, crashes - 1), MOST_BACKOFF);

export const crashesAfter = (
  model: { readonly crashes: number; readonly startedAt: number | null },
  at: number,
) =>
  model.startedAt !== null && at - model.startedAt >= STEADY
    ? 1
    : model.crashes + 1;
