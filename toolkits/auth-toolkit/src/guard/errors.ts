import { Schema } from 'effect';

export class Unauthenticated extends Schema.Error<Unauthenticated>(
  '@kestack/auth-toolkit/Unauthenticated',
)(
  { _tag: Schema.tag('Unauthenticated'), reason: Schema.String },
  { httpApiStatus: 401 },
) {}

export class Forbidden extends Schema.Error<Forbidden>(
  '@kestack/auth-toolkit/Forbidden',
)(
  { _tag: Schema.tag('Forbidden'), reason: Schema.String },
  { httpApiStatus: 403 },
) {}

/** Who is calling could not be found out, because the Auth Worker could not
 * be asked. Not the same as a call nobody signed. */
export class Unavailable extends Schema.Error<Unavailable>(
  '@kestack/auth-toolkit/Unavailable',
)(
  { _tag: Schema.tag('Unavailable'), reason: Schema.String },
  { httpApiStatus: 503 },
) {}

/** A Browser call whose cookie's Active Account is not the User it expected
 * (`expect-user`): another tab switched. Nothing ran as the wrong User. */
export class AccountChanged extends Schema.Error<AccountChanged>(
  '@kestack/auth-toolkit/AccountChanged',
)(
  { _tag: Schema.tag('AccountChanged'), reason: Schema.String },
  { httpApiStatus: 409 },
) {}

export const Failures = [
  Unauthenticated,
  Forbidden,
  Unavailable,
  AccountChanged,
] as const;

export const Failure = Schema.Union(Failures);
