import { Schema } from 'effect';
import type { Account } from '../accounts/index.js';

/** An Account as a Source knows it, stored and sent between tabs: whether
 * it is a Test User is not kept, it is read off the email. */
export type SourceAccount = Omit<Account, 'test'>;

export const AccountSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<SourceAccount, unknown>;

export const SnapshotSchema = Schema.Struct({
  active: Schema.NullOr(Schema.String),
  accounts: Schema.Array(AccountSchema),
});

/** Who is signed in, as a Source answers it: the Active Account's User id
 * (null when signed out) and every Account in sign-in order. */
export interface Snapshot {
  readonly active: string | null;
  readonly accounts: ReadonlyArray<SourceAccount>;
}
