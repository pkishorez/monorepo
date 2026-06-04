#!/usr/bin/env node
import { createServer } from 'node:http';
import { Console, Effect, Layer, Option } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { HttpMiddleware, HttpRouter } from 'effect/unstable/http';
import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from '@effect/platform-node';
import { DEFAULT_DB_PATH, makeDbLayer } from '../storage/index.js';
import { LotelApiLive } from '../server/http-api.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4318;

const hostFlag = Flag.string('host').pipe(Flag.optional);
const portFlag = Flag.integer('port').pipe(Flag.optional);
const dbFlag = Flag.string('db').pipe(Flag.optional);

const fromOption = <A>(option: Option.Option<A>, fallback: A): A =>
  Option.match(option, {
    onNone: () => fallback,
    onSome: (value) => value,
  });

const command = Command.make(
  'lotel',
  { host: hostFlag, port: portFlag, db: dbFlag },
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

      const serverLayer = HttpRouter.serve(LotelApiLive, {
        middleware: (app) => HttpMiddleware.logger(HttpMiddleware.cors()(app)),
      }).pipe(
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
  version: 'v0.0.1',
});

cli.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain());
