import { Effect, Layer } from 'effect';
import { Auth, Unreachable } from '@kstackz/auth-toolkit/clients/auth';

// TODO(Phase 4): the expo target of auth-toolkit's Auth (OAuth + PKCE in the
// system sign-in sheet, a token per User in secure storage; Ledger ADR 0009).
// Until then the Remote Backend answers as if the sign-in service could not
// be reached, and the signed-out card offers the Local Backend.
const notYet = Effect.fail(
  new Unreachable({
    reason: 'Signing in to the Remote Backend on a phone arrives in Phase 4.',
  }),
);

/** The Remote Backend as a phone reaches it. Sign-in is a Phase 4 stub. */
export const remote = {
  auth: Layer.succeed(Auth, {
    list: notYet,
    signIn: () => notYet,
    switchTo: () => notYet,
    signOut: () => notYet,
    signOutAll: notYet,
    takeLoginError: Effect.succeed(null),
  }),
  // The Mac's dev server in development, Ledger's own address otherwise.
  ledgerUrl: process.env.EXPO_PUBLIC_LEDGER_URL ?? 'https://kstack.kishore.app',
};
