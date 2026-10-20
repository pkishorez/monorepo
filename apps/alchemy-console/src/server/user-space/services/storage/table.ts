import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema, ESchema } from '@kestack/std-toolkit/eschema';
import { Provider } from '../../../../shared/contracts/credential/index.ts';
import {
  AccountType,
  ReturnTo,
} from '../../../../shared/contracts/github/index.ts';
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

/** A repository a GitHub connection reaches, as last fetched. */
const StoredRepository = Schema.Struct({
  fullName: Schema.String,
  private: Schema.Boolean,
  defaultBranch: Schema.String,
});

/** A GitHub connection: one App installation, and the repositories it reaches. */
const GitHubConnection = EntityESchema.make(
  'GitHubConnection',
  'connectionId',
  {
    installationId: Schema.Number,
    accountLogin: Schema.String,
    accountType: AccountType,
    avatarUrl: Schema.String,
    repositories: Schema.Array(StoredRepository),
    createdAt: Schema.Number,
    updatedAt: Schema.Number,
  },
).build();

export type StoredConnection = typeof GitHubConnection.Type;

export const gitHubConnection = userSpaceTable
  .entity(GitHubConnection)
  .primary({ pk: [] })
  .build();

/**
 * A one-time `state` GitHub carries back: on an install URL, or on the
 * question of who the member is on GitHub, for one installation.
 */
const InstallState = EntityESchema.make('InstallState', 'state', {
  kind: Schema.Literals(['install', 'authorize']),
  /** The installation an `authorize` state is for; null for `install`. */
  installationId: Schema.NullOr(Schema.Number),
  returnTo: ReturnTo,
  /** In milliseconds since the epoch. */
  issuedAt: Schema.Number,
}).build();

export type StoredInstallState = typeof InstallState.Type;

export const installState = userSpaceTable
  .entity(InstallState)
  .primary({ pk: [] })
  .build();
