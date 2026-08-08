import path from 'node:path';
import { Config, Effect } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { DEFAULT_DB_PATH } from '@pkishorez/code';

import { makeServerLive } from './server/index.ts';

const HOST = '127.0.0.1';

const port = Flag.integer('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on'),
  Flag.withFallbackConfig(
    Config.int('WHATEVER_PORT').pipe(Config.orElse(() => Config.int('PORT'))),
  ),
  Flag.withDefault(14500),
);

const db = Flag.string('db').pipe(
  Flag.withDescription('Path to the whatever database'),
  Flag.withFallbackConfig(Config.string('WHATEVER_DB')),
  Flag.withDefault(DEFAULT_DB_PATH),
);

const telemetryUrl = Flag.string('telemetry-url').pipe(
  Flag.withDescription('OTLP/HTTP endpoint for traces, logs, and metrics'),
  Flag.withFallbackConfig(Config.string('WHATEVER_TELEMETRY_URL')),
  Flag.withDefault('http://localhost:14400'),
);

export const serveCommand = Command.make(
  'serve',
  { port, db, telemetryUrl },
  Effect.fn(function* ({ port, db, telemetryUrl }) {
    yield* Effect.gen(function* () {
      console.log(`whatever code server on ws://${HOST}:${port}/rpc`);
      console.log(`db: ${path.resolve(db)}`);
      console.log(`telemetry: ${telemetryUrl}`);
      yield* Effect.never;
    }).pipe(
      Effect.provide(makeServerLive({ host: HOST, port, db, telemetryUrl })),
    );
  }),
).pipe(Command.withDescription('Serve the code RPC over websocket'));
