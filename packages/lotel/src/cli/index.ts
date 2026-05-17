#!/usr/bin/env node
import { createServer } from 'node:http';
import { Command, Options } from '@effect/cli';
import { HttpApiBuilder, HttpMiddleware } from '@effect/platform';
import {
  NodeContext,
  NodeHttpServer,
  NodeRuntime,
} from '@effect/platform-node';
import { Console, Effect, Layer, Option } from 'effect';
import { DEFAULT_DB_PATH, makeDbLayer } from '../storage/index.js';
import { LotelApiLive } from '../server/http-api.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4318;

const hostOption = Options.text('host').pipe(Options.optional);
const portOption = Options.integer('port').pipe(Options.optional);
const dbOption = Options.text('db').pipe(Options.optional);

const fromOption = <A>(option: Option.Option<A>, fallback: A): A =>
  Option.match(option, {
    onNone: () => fallback,
    onSome: (value) => value,
  });

const command = Command.make(
  'lotel',
  { host: hostOption, port: portOption, db: dbOption },
  ({ host, port, db }) =>
    Effect.gen(function* () {
      const resolvedHost = fromOption(
        host,
        process.env.LOTEL_HOST ?? DEFAULT_HOST,
      );
      const resolvedPort = fromOption(
        port,
        process.env.LOTEL_PORT
          ? Number.parseInt(process.env.LOTEL_PORT, 10)
          : DEFAULT_PORT,
      );
      const resolvedDb = fromOption(
        db,
        process.env.LOTEL_DB ?? DEFAULT_DB_PATH,
      );

      yield* Console.log(
        `lotel listening on http://${resolvedHost}:${resolvedPort}`,
      );
      yield* Console.log(`sqlite database: ${resolvedDb}`);

      const serverLayer = HttpApiBuilder.serve((app) =>
        HttpMiddleware.logger(HttpMiddleware.cors()(app)),
      ).pipe(
        Layer.provide(LotelApiLive),
        Layer.provide(makeDbLayer({ dbPath: resolvedDb })),
        Layer.provide(
          NodeHttpServer.layer(createServer, {
            host: resolvedHost,
            port: resolvedPort,
          }),
        ),
      );

      yield* Layer.launch(serverLayer).pipe(Effect.scoped);
    }),
);

const cli = Command.run(command, {
  name: 'lotel',
  version: 'v0.0.1',
});

cli(process.argv).pipe(
  Effect.provide(Layer.mergeAll(NodeContext.layer)),
  NodeRuntime.runMain(),
);
