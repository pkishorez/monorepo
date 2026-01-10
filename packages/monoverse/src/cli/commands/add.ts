import { Args, Command, Options } from '@effect/cli';
import { Console, Effect } from 'effect';
import { Monoverse } from '../../core/index.js';
import {
  findCurrentWorkspace,
  toDependencyType,
  type DependencyTypeShort,
} from '../helpers.js';

const packageArg = Args.text({ name: 'package' });

const typeOption = Options.choice('type', [
  'dependency',
  'dev',
  'peer',
  'optional',
] as const).pipe(Options.withAlias('t'), Options.withDefault('dependency'));

const versionOption = Options.text('version').pipe(
  Options.withAlias('v'),
  Options.withDefault('latest'),
);

const handler = ({
  package: pkg,
  type,
  version,
}: {
  package: string;
  type: DependencyTypeShort;
  version: string;
}) =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const { workspace } = yield* findCurrentWorkspace;
    const dependencyType = toDependencyType(type);

    yield* monoverse.addPackage({
      packageName: pkg,
      versionRange: version,
      dependencyType,
      workspace,
    });

    yield* Console.log(`Added ${pkg}@${version} to ${workspace.name}`);
  });

export const add = Command.make(
  'add',
  { package: packageArg, type: typeOption, version: versionOption },
  handler,
);
