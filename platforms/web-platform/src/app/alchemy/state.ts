import { Stage, localState } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { isDeployedStage } from './stage.ts';

const state = Layer.unwrap(
  Effect.gen(function* () {
    const stage = yield* Stage;
    return isDeployedStage(stage) ? Cloudflare.state() : localState();
  }),
);

/**
 * Where alchemy keeps what it has deployed, by Stage: a deployed Stage in
 * Cloudflare's state store, so CI and anyone deploying it share one
 * record; anyone's own on disk in `.alchemy/state`. Opt-in: a Stack may
 * keep its state anywhere else. What it needs is left untyped for the
 * Stack to give: pnpm may install the app's alchemy apart from this
 * package's, with other peers, and the two do not match by type.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export const State: Layer.Layer<
  Layer.Success<typeof state>,
  never,
  any
> = state;
