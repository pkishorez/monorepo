import { Schema } from 'effect';

/**
 * The signed-in, invited user a User Space belongs to, as the Auth Worker
 * names them. Console keeps no other profile.
 */
export const Member = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.String,
});

export type Member = typeof Member.Type;
