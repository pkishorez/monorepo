import { Context, Effect } from 'effect';
import { decodeTime, monotonicFactory } from 'ulidx';

const factory = monotonicFactory();

/**
 * Generates the `_u` meta field: a monotonic ULID.
 *
 * The factory state is module-scoped, so same-millisecond calls within an
 * isolate produce strictly ascending IDs — even where the clock is frozen
 * during synchronous execution (e.g. Cloudflare Workers). Override in tests
 * via `Effect.provideService(Ulid, () => ...)` for deterministic IDs.
 */
export const Ulid = Context.Reference<() => string>('std-toolkit/Ulid', {
  defaultValue: () => factory,
});

/** Yields a fresh monotonic ULID from the {@link Ulid} generator. */
export const nextUlid: Effect.Effect<string> = Effect.gen(function* () {
  return (yield* Ulid)();
});

const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/**
 * Extracts the millisecond timestamp from a `_u` value, format-agnostic:
 * a ULID yields its embedded time, an ISO-8601 string yields its parse time
 * (for backends that stamp `_u` with timestamps instead of ULIDs), and any
 * other value yields `null`.
 */
export const uTime = (u: string): number | null => {
  if (ULID_RE.test(u)) return decodeTime(u);
  const parsed = Date.parse(u);
  return Number.isNaN(parsed) ? null : parsed;
};
