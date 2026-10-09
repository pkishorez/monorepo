#!/usr/bin/env node
import { exec } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import envPaths from 'env-paths';
import { Config, Effect, References } from 'effect';
import { Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { skillsCommand } from '../cli/skills.js';
import { getTraceCommand, listTracesCommand } from '../cli/traces/index.js';
import { makeLocalDevtoolsServer } from './local-devtools-server/index.js';

const HOST = '127.0.0.1';
const { version: VERSION } = createRequire(import.meta.url)(
  '../../package.json',
) as { version: string };
const DEFAULT_DB_PATH = path.join(
  envPaths('devtools', { suffix: '' }).data,
  'devtools.sqlite',
);

const openInBrowser = (url: string) => {
  const opener =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start ""'
        : 'xdg-open';
  exec(`${opener} ${JSON.stringify(url)}`, () => {});
};

const port = Flag.Int('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on'),
  Flag.withFallbackConfig(Config.Int('DEVTOOLS_PORT')),
  Flag.withDefault(14400),
);

const db = Flag.String('db').pipe(
  Flag.withDescription(
    'Path to the DevTools database (traces, logs, and Projects)',
  ),
  Flag.withFallbackConfig(Config.String('DEVTOOLS_DB')),
  Flag.withDefault(DEFAULT_DB_PATH),
);

const open = Flag.Boolean('open').pipe(
  Flag.withDescription('Open DevTools in your default browser'),
  Flag.withDefault(false),
);

const command = Command.make(
  'devtools',
  { port, db, open },
  Effect.fn(function* ({ port, db, open }) {
    const devtoolsUrl = `http://${HOST}:${port}`;

    yield* Effect.gen(function* () {
      console.log(`devtools running on ${devtoolsUrl}`);
      console.log(`storage: ${path.resolve(db)}`);
      console.log(`open: ${devtoolsUrl}`);
      if (open) openInBrowser(devtoolsUrl);
      yield* Effect.never;
    }).pipe(
      Effect.provide(
        makeLocalDevtoolsServer({
          port,
          db,
          version: VERSION,
          skipUiCheck: process.env.DEVTOOLS_SKIP_UI_CHECK === '1',
        }),
      ),
    );
  }),
).pipe(
  Command.withDescription(
    'Run the DevTools Server: UI, RPC, and OTLP ingestion on loopback',
  ),
  Command.withSubcommands([listTracesCommand, getTraceCommand, skillsCommand]),
);

command.pipe(
  Command.run({ version: VERSION }),
  Effect.provide(NodeServices.layer),
  Effect.provideService(References.MinimumLogLevel, 'None'),
  NodeRuntime.runMain,
);
