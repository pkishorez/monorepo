import { Context, Effect, Layer } from 'effect';
import { mint } from '../../../run-token/index.ts';
import type {
  RunnerContainer,
  RunnerVariables,
} from '../../../runner-container/index.ts';

/*
 * Where a run's runner runs: one container per run, reached through the
 * Worker's `RUNNER` namespace by the run's ID. A container is given three
 * variables and nothing more: `RUN_ID`, `CONSOLE_URL`, and `RUN_TOKEN`, a
 * token for this user's run alone that expires with the run's time. No App
 * key, no Vault key and no credential ever reaches it: the runner asks the
 * User Space for what its run needs, over `/runner`, with that token.
 */

/** How long a run's token is good for: the run's 30 minutes, and a little more. */
const TOKEN_LIFETIME_MS = 35 * 60 * 1000;

export class RunnerHost extends Context.Service<
  RunnerHost,
  {
    /** Starts the container for `runId`, a run of this User Space's owner. */
    readonly start: (input: {
      readonly runId: string;
    }) => Effect.Effect<void, Error>;
    /** Stops the container for `runId`; nothing happens when none runs. */
    readonly stop: (runId: string) => Effect.Effect<void>;
  }
>()('alchemy-console/UserSpace/RunnerHost') {
  /**
   * Containers from `namespace`, told to reach Console at `consoleUrl`,
   * with tokens for `userId`'s runs signed under `vaultKey`. Without a
   * namespace or a URL, as where no container is bound, every start fails
   * and says why.
   */
  static readonly layer = (config: {
    readonly userId: string | undefined;
    readonly namespace: DurableObjectNamespace<RunnerContainer> | undefined;
    readonly consoleUrl: string | undefined;
    readonly vaultKey: string | undefined;
  }) =>
    Layer.succeed(
      RunnerHost,
      RunnerHost.of({
        start: ({ runId }) =>
          Effect.tryPromise({
            try: async () => {
              const { namespace, consoleUrl, vaultKey, userId } = config;
              if (
                namespace === undefined ||
                !consoleUrl ||
                !vaultKey ||
                !userId
              )
                throw new Error(
                  'Console has no runner here: RUNNER, CONSOLE_URL and CONSOLE_VAULT_KEY must be bound.',
                );
              const variables: RunnerVariables = {
                RUN_ID: runId,
                RUN_TOKEN: await mint(vaultKey, {
                  userId,
                  runId,
                  expiresAt: Date.now() + TOKEN_LIFETIME_MS,
                }),
                CONSOLE_URL: consoleUrl,
              };
              await namespace.getByName(runId).start(variables);
            },
            catch: (cause) =>
              cause instanceof Error
                ? cause
                : new Error('The run’s container didn’t start.'),
          }),
        stop: (runId) =>
          config.namespace === undefined
            ? Effect.void
            : Effect.tryPromise(() =>
                config.namespace!.getByName(runId).stop(),
              ).pipe(Effect.ignoreCause({ log: true })),
      }),
    );
}
