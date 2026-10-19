import { Effect, Exit, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { Storage } from '../../services/storage/index.ts';
import { Vault } from '../../services/vault/index.ts';
import { envFor } from './index.ts';

const key = Buffer.from(new Uint8Array(32).fill(3)).toString('base64');

type Stored = Parameters<Storage['Service']['credentials']['insert']>[0];

/** A Storage holding `records` only, as `envFor` reads it. */
const holding = (records: ReadonlyArray<Stored>) =>
  Layer.succeed(Storage, {
    credentials: {
      get: (id: string) =>
        Effect.succeed(records.find((r) => r.credentialId === id) ?? null),
    },
  } as unknown as Storage['Service']);

const sealed = (plaintext: string) =>
  Effect.runPromise(
    Effect.flatMap(Vault, (vault) => vault.encrypt(plaintext)).pipe(
      Effect.provide(Vault.layer(key)),
    ),
  );

const record = async (
  fields: Pick<Stored, 'credentialId' | 'provider' | 'region'>,
  secret: object,
): Promise<Stored> => ({
  name: 'n',
  accountId: 'a',
  accountName: null,
  createdAt: 0,
  updatedAt: 0,
  ...fields,
  sealed: await sealed(JSON.stringify(secret)),
});

const envOf = async (records: ReadonlyArray<Stored>, id: string) =>
  Effect.runPromiseExit(
    envFor(id).pipe(
      Effect.provide(Layer.merge(holding(records), Vault.layer(key))),
    ),
  );

describe('envFor', () => {
  it('opens a Cloudflare credential into the env Alchemy reads', async () => {
    const records = [
      await record(
        { credentialId: 'c1', provider: 'cloudflare', region: null },
        { accountId: 'acc', apiToken: 'tok' },
      ),
    ];
    expect(await envOf(records, 'c1')).toEqual(
      Exit.succeed({
        CLOUDFLARE_ACCOUNT_ID: 'acc',
        CLOUDFLARE_API_TOKEN: 'tok',
      }),
    );
  });

  it('opens an AWS credential with its region and session token', async () => {
    const records = [
      await record(
        { credentialId: 'a1', provider: 'aws', region: 'eu-west-1' },
        { accessKeyId: 'AKIA', secretAccessKey: 'shh', sessionToken: 'st' },
      ),
    ];
    expect(await envOf(records, 'a1')).toEqual(
      Exit.succeed({
        AWS_ACCESS_KEY_ID: 'AKIA',
        AWS_SECRET_ACCESS_KEY: 'shh',
        AWS_REGION: 'eu-west-1',
        AWS_SESSION_TOKEN: 'st',
      }),
    );
  });

  it('fails as not found for a credential that is gone', async () => {
    const exit = await envOf([], 'nope');
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
