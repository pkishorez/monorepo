/*
 * `@kestack/auth-toolkit/fake`: auth-toolkit's stand-in for the Auth
 * Worker, for fake mode and tests.
 *
 * - `signIn({ cache })`  the Sign-in fake, for a FakeWorld: who is signed
 *                        in on this browser, a sign-in waiting until its
 *                        controls answer it, on the same page. Its Layer
 *                        gives the browser's Accounts, the real client over
 *                        it.
 * - `fakeAccounts`       the same Accounts over a Sign-in fake of its own,
 *                        each sign-in answered by `choose`, for tests.
 * - `fakeGuard`          the Guard's server half, reading the fake tokens;
 *                        `fakeSigning` and `fakeSignIn` a device signed in
 *                        on a Sign-in of its own.
 */

export { fakeAccounts, fakeGuard, fakeSigning } from './fake.js';
export { fakeSignIn } from './principal.js';
export { signIn } from './sign-in.js';

export type { FakeChoice } from './fake.js';
export type { SignInOptions, SignInState } from './sign-in.js';
