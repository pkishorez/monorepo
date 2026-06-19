import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { createSchemaScaffold } from './scaffold.js';

const rootFlag = Flag.string('root').pipe(
  Flag.withDescription('Schema collection root for the new schema'),
);

const schemaPathArgument = Argument.string('schema-path').pipe(
  Argument.withDescription('Schema path below the schema collection root'),
);

export const createCommand = Command.make(
  'create',
  {
    root: rootFlag,
    schemaPath: schemaPathArgument,
  },
  ({ root, schemaPath }) =>
    Effect.gen(function* () {
      const schemaRoot = yield* createSchemaScaffold(root, schemaPath);
      yield* Console.log(`Created schema scaffold: ${schemaRoot}`);
    }),
).pipe(Command.withDescription('Create a new schema root scaffold'));
