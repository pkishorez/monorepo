import { Context } from 'effect';
import type { Effect } from 'effect';

/** What the screen that opens the sheet Provides, and hears back through. */
export class AddCredentialOpener extends Context.Service<
  AddCredentialOpener,
  {
    /** Verified and kept: the new credential's ID. */
    readonly added: (credentialId: string) => Effect.Effect<void>;
    /** The user closed the sheet without adding one. */
    readonly closed: Effect.Effect<void>;
  }
>()('alchemy-console/AddCredentialOpener') {}
