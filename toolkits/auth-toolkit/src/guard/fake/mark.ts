import { Effect } from 'effect';
import { FAKE_DOMAIN } from './token.js';

/** In every bundle that carries the Fake, so a production build is checked
 * for it (the Web Platform fails one that has it), and the condition that
 * swaps the Fake in for the real doors in development. */
export const FAKE_MARK = 'kestack-fake-auth';

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
