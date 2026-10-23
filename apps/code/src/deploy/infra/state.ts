import { Stage, localState } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer } from 'effect';
import { isDeployedStage } from './stage.ts';

/**
 * Where Alchemy keeps what it has deployed, by stage. A deployed stage
 * (`prod`, `demo`, `pr<N>`) keeps it in the Cloudflare state store, so CI
 * and anyone deploying it share one record. A personal stage, as under
 * `alchemy dev`, keeps it on disk in `.alchemy/state`, which is gitignored.
 */
export const State = Layer.unwrap(
  Effect.gen(function* () {
    const stage = yield* Stage;
    return isDeployedStage(stage) ? Cloudflare.state() : localState();
  }),
);
