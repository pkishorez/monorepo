import { Effect } from 'effect';

/**
 * The names of the projects that deploy with a credential, which may not be
 * removed while any does. There are no projects yet: the Destroy task fills
 * this in once environments name their credentials.
 */
export const projectsUsing = (
  _credentialId: string,
): Effect.Effect<ReadonlyArray<string>> => Effect.succeed([]);
