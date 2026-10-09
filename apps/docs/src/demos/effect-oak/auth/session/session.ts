import { Context, Schema } from 'effect';

/*
 * Who is signed in, and the two Services the app gives its pages around it:
 * SignIn while nobody is, SignedIn while someone is.
 */

export const Session = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.String,
});
export type Session = typeof Session.Type;

/** Provided while signed out: a login form reports a session through it. */
export class SignIn extends Context.Service<
  SignIn,
  { readonly complete: (session: Session) => void }
>()('docs/auth/SignIn') {}

/** Provided while signed in: who it is, and a way to sign out. */
export class SignedIn extends Context.Service<
  SignedIn,
  { readonly session: Session; readonly logOut: () => void }
>()('docs/auth/SignedIn') {}
