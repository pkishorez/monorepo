import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { d1PrimaryDatabaseResource } from 'auth-toolkit/alchemy/d1';
import { Config, Effect, Redacted } from 'effect';
import { isDeployedStage } from '../stage.ts';
import SignalingWorker from './signaling-worker.ts';

const localSecret = (name: string, fallback: string) =>
  Config.redacted(name).pipe(
    Config.withDefault(Redacted.make(fallback)),
    Config.map(Redacted.value),
    Effect.orDie,
  );

export const DurableWebRtc = Effect.gen(function* () {
  const stage = yield* Stage;
  const isLocal = !isDeployedStage(stage);
  const auth = isLocal
    ? yield* Effect.gen(function* () {
        const database = yield* d1PrimaryDatabaseResource('DurableWebRtcAuth');
        return yield* Cloudflare.Worker('DurableWebRtcAuthWorker', {
          main: './src/infra/durable-webrtc/auth-worker.ts',
          workersDev: false,
          env: {
            DB: database,
            AUTH_SECRET: yield* localSecret(
              'DURABLE_WEBRTC_AUTH_SECRET',
              'local-durable-webrtc-secret-change-me',
            ),
            GOOGLE_CLIENT_ID: yield* localSecret(
              'DURABLE_WEBRTC_GOOGLE_CLIENT_ID',
              'local-google-client-id',
            ),
            GOOGLE_CLIENT_SECRET: yield* localSecret(
              'DURABLE_WEBRTC_GOOGLE_CLIENT_SECRET',
              'local-google-client-secret',
            ),
          },
        });
      })
    : undefined;
  const signaling = yield* SignalingWorker;

  return { ...(auth === undefined ? {} : { auth }), signaling };
});
