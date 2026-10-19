import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema, ESchema } from '@kestack/std-toolkit/eschema';
import { Provider } from '../../../../shared/contracts/credential/index.ts';
import { Member } from '../../../../shared/contracts/member/index.ts';

/*
 * The one table every User Space keeps on its own SQLite: a user's records
 * live only in their own Durable Object. Each entity is defined here, beside
 * the table, and its names are stored, so they never change.
 */

export const userSpaceTable = StdTable.make('user-space')
  .primary('pk', 'sk')
  .build();

/** Who this User Space belongs to, as last verified: unknown until their first call. */
const Owner = ESchema.make('Owner', {
  member: Schema.NullOr(Member),
  /** When the Worker verified them so, in milliseconds since the epoch. */
  at: Schema.Number,
}).build();

export const owner = userSpaceTable
  .singleEntity(Owner)
  .default({ member: null, at: 0 });

/** A Provider credential: its secret only ever as the Vault sealed it. */
const Credential = EntityESchema.make('Credential', 'credentialId', {
  name: Schema.String,
  provider: Provider,
  accountId: Schema.String,
  accountName: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  /** The provider's keys as JSON, sealed by the Vault. */
  sealed: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
}).build();

export type StoredCredential = typeof Credential.Type;

/** Every credential is the owner's, so they share one partition. */
export const credential = userSpaceTable
  .entity(Credential)
  .primary({ pk: [] })
  .build();
