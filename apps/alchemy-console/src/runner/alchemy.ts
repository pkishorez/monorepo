import { readFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  InspectResult,
  RunnerEvent,
} from '../shared/contracts/run/index.ts';

/*
 * The project's own Alchemy, as the runner drives it (ADR 0005): resolved
 * from the project's folder, never bundled with the runner, and run on the
 * project's own copy of Effect. Inspect opens the stack the way Alchemy's
 * CLI does and reads its name, the providers it registers, and where it
 * keeps its state, changing nothing. Deploy plans the stage, tells the plan,
 * then applies it, telling each resource's every move as Alchemy reports
 * it, and answers the stack's outputs.
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

/** The project's Alchemy and its own Effect, loaded from `folder`. */
const load = async (folder: string) => {
  const alchemy = resolveAlchemy(folder);
  // The stack's module is TypeScript: load it as Alchemy's CLI does.
  if (!loaderRegistered) {
    await importFrom(path.join(alchemy.root, 'bin', 'register-oxc.js'));
    loaderRegistered = true;
  }
  const fromAlchemy = createRequire(path.join(alchemy.root, 'package.json'));
  // The project's own Effect: Alchemy's values only run on it.
  const effect = (await importFrom(
    fromAlchemy.resolve('effect'),
  )) as typeof import('effect');
  const Alchemist = await importFrom(
    alchemy.require.resolve('alchemy/Alchemist'),
  );
  const { AuthProviders } = await importFrom(
    alchemy.require.resolve('alchemy/Auth'),
  );
  // The stack resolves its entrypoint, and keeps any file it writes, here.
  process.chdir(folder);
  return { alchemy, effect, Alchemist, AuthProviders };
};

/** Why a program on the project's Effect failed, in words. */
const reasonOf = (
  Cause: typeof import('effect').Cause,
  cause: import('effect').Cause.Cause<unknown>,
) => {
  const reason = Cause.squash(cause);
  return reason instanceof Error ? reason.message : String(reason);
};

/** What the stack in `folder`'s `entrypoint` is, at `stage`. */
export const inspect = async (options: {
  readonly folder: string;
  readonly entrypoint: string;
  readonly stage: string;
}): Promise<InspectResult> => {
  const { alchemy, effect, Alchemist, AuthProviders } = await load(
    options.folder,
  );
  const { Cause, Context, Effect, Exit } = effect;
  const { State } = await importFrom(alchemy.require.resolve('alchemy/State'));

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
  if (Exit.isFailure(exit))
    throw new InspectFailure(
      `The stack didn’t open: ${reasonOf(Cause, exit.cause)}`,
    );
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

/** An Alchemy progress event, as much of it as a Deploy tells. */
type Progress =
  | { readonly _tag: 'plan.phase'; readonly phase: string }
  | {
      readonly _tag: 'apply.resource.status';
      readonly fqn: string;
      readonly id: string;
      readonly type: string;
      readonly status: string;
      readonly message?: string;
    }
  | {
      readonly _tag: 'apply.resource.note';
      readonly id: string;
      readonly message: string;
    }
  | { readonly _tag: 'state.bootstrap.started'; readonly store: string }
  | { readonly _tag: 'state.bootstrap.completed'; readonly store: string }
  | { readonly _tag: string };

const PHASE_WORDS: Readonly<Record<string, string>> = {
  'importing-module': 'Loading the stack',
  'resolving-services': 'Setting up its providers',
  'loading-state': 'Reading its state',
  'computing-plan': 'Working out what to change',
};

/** Each output as text: a string as it is, anything else as JSON. */
export const outputsOf = (output: unknown): Record<string, string> => {
  if (output === null || typeof output !== 'object' || Array.isArray(output))
    return output === undefined ? {} : { output: textOf(output) };
  return Object.fromEntries(
    Object.entries(output as Record<string, unknown>).map(([key, value]) => [
      key,
      textOf(value),
    ]),
  );
};

const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/**
 * Deploys `stage` of the stack in `folder`'s `entrypoint` with the provider
 * credentials already in the environment: plans, tells the plan, applies
 * it, and answers the stack's outputs. A missing Cloudflare state store is
 * deployed first, as `alchemy deploy --yes` does.
 */
export const deploy = async (options: {
  readonly folder: string;
  readonly entrypoint: string;
  readonly stage: string;
  /** Each step, as the run reports it. */
  readonly onEvent: (event: RunnerEvent) => void;
  /** A line for the run's log. */
  readonly onLine: (line: string) => void;
}): Promise<Record<string, string>> => {
  const { effect, Alchemist, AuthProviders } = await load(options.folder);
  const { Cause, Effect, Exit, Logger } = effect;
  // Whatever the stack logs, Alchemy or its providers, joins the run's log,
  // where the provider keys are scrubbed: nothing reaches stdout raw.
  const toLog = (...parts: ReadonlyArray<unknown>) =>
    options.onLine(
      parts
        .flatMap((part) => (Array.isArray(part) ? part : [part]))
        .map((part) => (typeof part === 'string' ? part : textOf(part)))
        .join(' '),
    );
  const logger = Logger.make(({ message }) => toLog(message));
  const report = (event: Progress) =>
    Effect.sync(() => {
      switch (event._tag) {
        case 'plan.phase': {
          const words = PHASE_WORDS[(event as { phase: string }).phase];
          if (words !== undefined) options.onLine(`${words}…`);
          return;
        }
        case 'state.bootstrap.started':
          options.onLine(
            `Setting up the Cloudflare state store ${(event as { store: string }).store}…`,
          );
          return;
        case 'state.bootstrap.completed':
          options.onLine('The Cloudflare state store is ready.');
          return;
        case 'apply.resource.note': {
          const note = event as { id: string; message: string };
          options.onLine(`${note.id}: ${note.message}`);
          return;
        }
        case 'apply.resource.status': {
          const status = event as Extract<
            Progress,
            { _tag: 'apply.resource.status' }
          >;
          options.onEvent({
            _tag: 'ResourceStatus',
            fqn: status.fqn,
            logicalId: status.id,
            resourceType: status.type,
            status: status.status,
            message: status.message ?? null,
          });
          if (status.message !== undefined)
            options.onLine(`${status.id}: ${status.message}`);
          return;
        }
      }
    });
  const program = Effect.gen(function* () {
    const snapshot = yield* Alchemist.Stack.plan({
      target: { entrypoint: options.entrypoint, stage: options.stage },
      operation: 'deploy',
      updateStateStore: true,
    });
    options.onEvent({
      _tag: 'Planned',
      resources: [
        ...(
          snapshot.resources as ReadonlyArray<{
            fqn: string;
            logicalId: string;
            resourceType: string;
            action: string;
          }>
        ).map(({ fqn, logicalId, resourceType, action }) => ({
          fqn,
          logicalId,
          resourceType,
          action,
        })),
        ...(
          snapshot.actions as ReadonlyArray<{
            fqn: string;
            logicalId: string;
            actionType: string;
            action: string;
          }>
        ).map(({ fqn, logicalId, actionType, action }) => ({
          fqn,
          logicalId,
          resourceType: actionType,
          action,
        })),
      ],
    });
    options.onEvent({ _tag: 'Phase', phase: 'applying' });
    return yield* Alchemist.Stack.apply(snapshot);
  }).pipe(
    Effect.provideService(Alchemist.Progress, report),
    Effect.provideService(AuthProviders, {}),
    Effect.provide(Alchemist.layer()),
    Effect.scoped,
    Effect.provideService(Logger.CurrentLoggers, new Set([logger])),
  );
  const kept = { ...console };
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
    console[method] = toLog;
  try {
    const exit = await Effect.runPromiseExit(program as never);
    if (Exit.isFailure(exit))
      throw new InspectFailure(
        `The deploy failed: ${reasonOf(Cause, exit.cause)}`,
      );
    return outputsOf((exit as { value: unknown }).value);
  } finally {
    Object.assign(console, kept);
  }
};
