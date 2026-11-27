import { Schema } from 'effect';
import { ESchema } from '@kestack/std-toolkit/eschema';

/*
 * How a Connection signs in: Connect Cloud answers `GET /auth`, to anyone,
 * with the Auth Worker to sign in through, so `serve` needs Connect Cloud's
 * address alone.
 */

/** The path that answers how a Connection signs in: `AuthInfo`. */
export const AUTH_PATH = '/auth';

/** How a Connection signs in to reach Connect Cloud: through the Auth Worker at `url`. */
export const AuthInfo = ESchema.make('AuthInfo', {
  url: Schema.String,
}).build();
export type AuthInfo = typeof AuthInfo.Type;
