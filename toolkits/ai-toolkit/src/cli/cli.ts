import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Config, Effect, Layer } from 'effect';
import { Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Harnesses } from '../harness/index.js';
import { claude } from '../harnesses/claude/index.js';
import { codex, codexTitler } from '../harnesses/codex/index.js';
import { server } from './server/index.js';

/*
 * `ai-toolkit serve`: the composition root. Claude and Codex as the
 * harnesses, Codex writing titles, the database at ~/.ai-toolkit/ai.db
 * unless told otherwise, and the API at ws://127.0.0.1:<port>/rpc.
 */

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4590;
const DEFAULT_DB = join(homedir(), '.ai-toolkit', 'ai.db');

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly version: string };

const all = [claude, codex];
const harnesses = Layer.merge(
  Layer.succeed(Harnesses, {
    all,
    get: (name) => {
      const found = all.find((harness) => harness.name === name);
      if (!found) throw new Error(`No harness named ${name}`);
      return found;
    },
  }),
  codexTitler,
);

const port = Flag.Int('port').pipe(
  Flag.withAlias('p'),
  Flag.withDescription('Port to listen on; PORT, else 4590'),
  Flag.withFallbackConfig(Config.Int('PORT')),
  Flag.withDefault(DEFAULT_PORT),
);

const db = Flag.String('db').pipe(
  Flag.withDescription('The SQLite database file'),
  Flag.withDefault(DEFAULT_DB),
);

const serve = Command.make(
  'serve',
  { port, db },
  Effect.fn(function* ({ port, db }) {
    mkdirSync(dirname(db), { recursive: true });
    yield* Effect.log(`ai-toolkit ${version} on ws://${HOST}:${port}/rpc`);
    yield* Effect.log(`database ${db}`);
    yield* Layer.launch(server({ port, host: HOST, db, harnesses }));
  }),
).pipe(Command.withDescription('Run the ai-toolkit server'));

Command.make('ai-toolkit', {}, () => Effect.void).pipe(
  Command.withSubcommands([serve]),
  Command.run({ version }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
