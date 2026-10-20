import { readFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { InspectResult } from '../shared/contracts/run/index.ts';

/*
 * The project's own Alchemy, as the runner drives it (ADR 0005): resolved
 * from the project's folder, never bundled with the runner, and run on the
 * project's own copy of Effect. Inspect opens the stack the way Alchemy's
 * CLI does and reads its name, the providers it registers, and where it
 * keeps its state, changing nothing.
 */

/** The oldest Alchemy whose `Alchemist` the runner speaks. */
export const MINIMUM_ALCHEMY = '2.0.0-beta.80';

/** A reason an Inspect failed, worded for the project's owner. */
export class InspectFailure extends Error {}

export const LOCAL_STATE =
  'This project keeps its state in a local file. Use `Cloudflare.state()` to deploy from Console.';

const parse = (version: string) => {
  const [main = '', pre] = version.split('+')[0]!.split(/-(.*)/s);
  return {
    main: main.split('.').map((part) => Number(part) || 0),
    pre: pre === undefined ? [] : pre.split('.'),
  };
};

/** Semver order of `a` and `b`: negative when `a` is older. */
export const compareVersions = (a: string, b: string) => {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (left.main[i] ?? 0) - (right.main[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // A release is newer than any of its prereleases.
  if (left.pre.length === 0 || right.pre.length === 0)
    return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numeric = /^[0-9]+$/.test(x) && /^[0-9]+$/.test(y);
    const diff = numeric ? Number(x) - Number(y) : x < y ? -1 : x > y ? 1 : 0;
    if (diff !== 0) return diff;
  }
  return 0;
};

const importFrom = (file: string) => import(pathToFileURL(file).href);

interface Resolved {
  readonly version: string;
  readonly root: string;
  readonly require: NodeJS.Require;
}

/** The Alchemy `folder` installs, checked against the minimum. */
export const resolveAlchemy = (folder: string): Resolved => {
  const fromProject = createRequire(path.join(folder, 'package.json'));
  let alchemist: string;
  try {
    alchemist = fromProject.resolve('alchemy/Alchemist');
  } catch {
    throw new InspectFailure(
      'This folder doesn’t install Alchemy: add `alchemy` to its dependencies.',
    );
  }
  const manifest = findPackageJSON(pathToFileURL(alchemist));
  if (manifest === undefined)
    throw new InspectFailure('This folder’s Alchemy has no package.json.');
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as {
    readonly version: string;
  };
  if (compareVersions(version, MINIMUM_ALCHEMY) < 0)
    throw new InspectFailure(
      `This project uses Alchemy ${version}; Console needs ${MINIMUM_ALCHEMY} or later.`,
    );
  return { version, root: path.dirname(manifest), require: fromProject };
};

let loaderRegistered = false;

/** What the stack in `folder`'s `entrypoint` is, at `stage`. */
export const inspect = async (options: {
  readonly folder: string;
  readonly entrypoint: string;
  readonly stage: string;
}): Promise<InspectResult> => {
  const alchemy = resolveAlchemy(options.folder);
  // The stack's module is TypeScript: load it as Alchemy's CLI does.
  if (!loaderRegistered) {
    await importFrom(path.join(alchemy.root, 'bin', 'register-oxc.js'));
    loaderRegistered = true;
  }
  const fromAlchemy = createRequire(path.join(alchemy.root, 'package.json'));
  // The project's own Effect: Alchemy's values only run on it.
  const { Cause, Context, Effect, Exit } = (await importFrom(
    fromAlchemy.resolve('effect'),
  )) as typeof import('effect');
  const Alchemist = await importFrom(
    alchemy.require.resolve('alchemy/Alchemist'),
  );
  const { State } = await importFrom(alchemy.require.resolve('alchemy/State'));
  const { AuthProviders } = await importFrom(
    alchemy.require.resolve('alchemy/Auth'),
  );

  // The stack resolves its entrypoint, and keeps any file it writes, here.
  process.chdir(options.folder);
  // Filled by the providers the stack registers as it opens.
  const registered: Record<string, unknown> = {};
  const program = Effect.gen(function* () {
    const session = yield* Alchemist.open({
      entrypoint: options.entrypoint,
      stage: options.stage,
    });
    const state = yield* Effect.exit(
      Effect.timeout(
        Context.get(session.context, State) as never,
        '60 seconds',
      ),
    );
    return { stackName: session.stack.name as string, state };
  }).pipe(
    Effect.provideService(AuthProviders, registered),
    Effect.provide(Alchemist.layer()),
    Effect.scoped,
  );
  const exit = await Effect.runPromiseExit(program as never);
  if (Exit.isFailure(exit)) {
    const reason = Cause.squash(exit.cause);
    throw new InspectFailure(
      `The stack didn’t open: ${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
  const { stackName, state } = (
    exit as { value: { stackName: string; state: unknown } }
  ).value;
  return {
    stackName,
    stateStore: stateStoreOf(state as never, Cause, Exit),
    providers: Object.keys(registered)
      .map((name) => name.toLowerCase())
      .sort(),
    alchemyVersion: alchemy.version,
  };
};

/**
 * Where the stack keeps its state. Opening a store may need the provider's
 * credentials, which an Inspect before a project has none of: a store that
 * stops for Cloudflare's credentials is kept in the Cloudflare account.
 */
const stateStoreOf = (
  exit: import('effect').Exit.Exit<{ readonly id: string }, unknown>,
  Cause: typeof import('effect').Cause,
  Exit: typeof import('effect').Exit,
): InspectResult['stateStore'] => {
  if (Exit.isSuccess(exit)) {
    const { id } = exit.value;
    if (id === 'cloudflare-http') return 'cloudflare';
    if (id === 'local') throw new InspectFailure(LOCAL_STATE);
    return { other: id };
  }
  const reason = Cause.squash(exit.cause) as {
    readonly _tag?: unknown;
    readonly provider?: unknown;
    readonly message?: unknown;
  };
  if (
    reason?._tag === 'CredentialsUnavailable' &&
    reason.provider === 'Cloudflare'
  )
    return 'cloudflare';
  throw new InspectFailure(
    `The stack’s state store didn’t open: ${typeof reason?.message === 'string' ? reason.message : String(reason)}`,
  );
};
