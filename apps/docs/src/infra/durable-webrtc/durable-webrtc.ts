import { Stage } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { d1PrimaryDatabaseResource } from 'auth-toolkit/alchemy/d1';
import { Config, Effect, Redacted } from 'effect';
import { isDeployedStage } from '../stage.ts';
import SignalingWorker from './signaling-worker.ts';

const secret = (name: string, fallback: string, isLocal: boolean) =>
  (isLocal
    ? Config.redacted(name).pipe(Config.withDefault(Redacted.make(fallback)))
    : Config.redacted(name)
  ).pipe(Config.map(Redacted.value), Effect.orDie);

export const DurableWebRtc = Effect.gen(function* () {
  const stage = yield* Stage;
  const isLocal = !isDeployedStage(stage);
  const database = yield* d1PrimaryDatabaseResource('DurableWebRtcAuth');
  const auth = yield* Cloudflare.Worker('DurableWebRtcAuthWorker', {
    main: './src/infra/durable-webrtc/auth-worker.ts',
    workersDev: false,
    env: {
      DB: database,
      AUTH_SECRET: yield* secret(
        'DURABLE_WEBRTC_AUTH_SECRET',
        'local-durable-webrtc-secret-change-me',
        isLocal,
      ),
      GOOGLE_CLIENT_ID: yield* secret(
        'DURABLE_WEBRTC_GOOGLE_CLIENT_ID',
        'local-google-client-id',
        isLocal,
      ),
      GOOGLE_CLIENT_SECRET: yield* secret(
        'DURABLE_WEBRTC_GOOGLE_CLIENT_SECRET',
        'local-google-client-secret',
        isLocal,
      ),
    },
  });
  const signaling = yield* SignalingWorker;

  return { auth, signaling };
});
