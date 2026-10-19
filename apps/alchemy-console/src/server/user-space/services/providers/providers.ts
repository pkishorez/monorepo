import { Context, Effect, Layer } from 'effect';
import type {
  CredentialError,
  NewCredential,
} from '../../../../shared/contracts/credential/index.ts';
import { verifyAws } from './aws.ts';
import { verifyCloudflare } from './cloudflare.ts';
import type { Fetch } from './refusal.ts';

/*
 * The providers Console holds credentials for, asked whether a set of keys
 * works and which account it belongs to. Each refusal names the field to
 * fix, in the provider's own words, with the keys cut out.
 */

/** The account a provider confirmed. */
interface Confirmed {
  readonly accountId: string;
  /** Cloudflare's account name; null for AWS. */
  readonly accountName: string | null;
  /** The AWS region it was confirmed in; null for Cloudflare. */
  readonly region: string | null;
}

export class Providers extends Context.Service<
  Providers,
  {
    /** The account `input`'s keys belong to, as their provider confirms. */
    readonly verify: (
      input: NewCredential,
    ) => Effect.Effect<Confirmed, CredentialError>;
  }
>()('alchemy-console/UserSpace/Providers') {
  /** The providers, asked through `fetch`: the Worker's own, in the object. */
  static readonly layer = (fetch: Fetch) =>
    Layer.succeed(
      Providers,
      Providers.of({
        verify: (input) =>
          input.provider === 'cloudflare'
            ? verifyCloudflare(fetch, input.secret)
            : verifyAws(fetch, input.secret, input.region),
      }),
    );
}
