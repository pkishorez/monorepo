import { Effect } from 'effect';
import { FAKE_DOMAIN } from './token.js';

/** In every bundle that carries a fake, here in the warning every Layer of
 * the Sign-in fake and `fakeGuard` gives, so a production build that has
 * one fails (`@kestack/web-platform`'s `noFake`). */
export const FAKE_MARK = 'kestack-fake';

// Said once per process, however often a Layer is built.
let warned = false;

/** Warns, once, that anyone may sign in as anyone. */
export const warn = Effect.suspend(() => {
  if (warned) return Effect.void;
  warned = true;
  return Effect.logWarning(
    `${FAKE_MARK}: anyone may sign in as any @${FAKE_DOMAIN} User. Never in production.`,
  );
});
