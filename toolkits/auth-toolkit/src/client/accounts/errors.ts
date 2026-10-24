import { Data } from 'effect';

/** The Auth Worker could not be asked. `kind` says how:
 * `'unreachable'`, no answer at all; `'server-error'`, it answered with a
 * server error (`status`); `'unreadable'`, its answer could not be read,
 * so the service and this client may be incompatible. */
export class AuthWorkerUnavailable extends Data.TaggedError(
  'AuthWorkerUnavailable',
)<{
  readonly url: string;
  readonly kind: 'unreachable' | 'server-error' | 'unreadable';
  readonly status?: number;
}> {
  override get message() {
    switch (this.kind) {
      case 'unreachable':
        return `Could not reach the sign-in service at ${this.url}. Check your connection and try again.`;
      case 'server-error':
        return `The sign-in service at ${this.url} is temporarily unavailable (HTTP ${this.status}). Try again in a moment.`;
      case 'unreadable':
        return `The sign-in service at ${this.url} returned a response this client could not understand. The service and client may be incompatible.`;
    }
  }
}

/** The Auth Worker refused the request; `reason` is what it said, if
 * anything, and `code` the error code it named. */
export class AuthWorkerRejected extends Data.TaggedError('AuthWorkerRejected')<{
  readonly url: string;
  readonly status: number;
  readonly reason?: string;
  readonly code?: string;
}> {
  override get message() {
    return (
      this.reason ??
      `The sign-in service at ${this.url} rejected the request (HTTP ${this.status}). Check its URL and configuration.`
    );
  }
}

/** A Device Login ended without a Sign-in. */
export class DeviceLoginFailed extends Data.TaggedError('DeviceLoginFailed')<{
  readonly reason: 'expired' | 'denied';
}> {
  override get message() {
    return this.reason === 'denied'
      ? 'Sign-in was denied in the browser.'
      : 'The sign-in code expired before it was approved. Sign in again.';
  }
}

/** Signing one more Account in would pass the Account limit. */
export class AccountLimitReached extends Data.TaggedError(
  'AccountLimitReached',
)<{ readonly limit: number }> {
  override get message() {
    return `Already signed in to ${this.limit} accounts. Sign one out first.`;
  }
}

/** The Auth Worker refused a Test User sign-in. `code` is its reason:
 * `NOT_A_TEST_EMAIL`, `WRONG_KEY`, `NOT_ALLOWED`, `TOO_MANY_ACCOUNTS`,
 * `TEST_USERS_OFF` (the
 * Auth Worker has Test Users off), or another the Auth Worker names. */
export class TestSignInRefused extends Data.TaggedError('TestSignInRefused')<{
  readonly code: string;
  readonly reason?: string;
}> {
  override get message() {
    return this.reason ?? `Test User sign-in was refused (${this.code}).`;
  }
}

/** This client cannot sign a Test User in: only a Browser can. */
export class TestSignInUnsupported extends Data.TaggedError(
  'TestSignInUnsupported',
)<{ readonly client: string }> {
  override get message() {
    return `A ${this.client} cannot sign a Test User in; sign in from a Browser.`;
  }
}

/** Why an `Accounts` action failed. */
export type AccountsError =
  | AuthWorkerUnavailable
  | AuthWorkerRejected
  | DeviceLoginFailed
  | AccountLimitReached
  | TestSignInRefused
  | TestSignInUnsupported;
