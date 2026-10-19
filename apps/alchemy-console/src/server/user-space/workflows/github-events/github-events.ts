import { Effect } from 'effect';
import { forget, refresh } from '../connections/index.ts';

/*
 * A GitHub webhook delivery, once the Worker has checked its signature and
 * found, in the connection index, that this member owns its installation.
 *
 * - installation, `deleted`        → the connection and its index row go;
 * - installation, anything else,
 *   installation_repositories       → the connection is read again;
 * - push, pull_request             → accepted, and ignored until GitHub-
 *                                    driven runs deploy them;
 * - anything else                  → ignored.
 */

export interface Delivery {
  /** GitHub's `X-GitHub-Event`. */
  readonly event: string;
  readonly payload: unknown;
}

const fieldsOf = (payload: unknown) => {
  const body = (payload ?? {}) as {
    readonly action?: unknown;
    readonly installation?: { readonly id?: unknown };
  };
  return {
    action: typeof body.action === 'string' ? body.action : null,
    installationId:
      typeof body.installation?.id === 'number' ? body.installation.id : null,
  };
};

/** Handles `delivery` for `userId`, whose User Space this is. */
export const receive = (userId: string, { event, payload }: Delivery) =>
  Effect.gen(function* () {
    const { action, installationId } = fieldsOf(payload);
    if (installationId === null) return;
    switch (event) {
      case 'installation':
        return action === 'deleted'
          ? yield* forget(userId, installationId)
          : yield* refresh(userId, installationId);
      case 'installation_repositories':
        return yield* refresh(userId, installationId);
      case 'push':
      case 'pull_request':
        // GitHub-driven runs take these up.
        return;
      default:
        return;
    }
  });
