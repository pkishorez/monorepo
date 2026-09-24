import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { Console, Effect, Option, Result } from 'effect';
import { Command } from 'effect/unstable/cli';
import { analyzeProject, loadChangeSet } from 'laymos';

import {
  planSnapshot,
  projectFileStem,
  themedPath,
  themesFor,
} from '../../domain/snapshot/index.js';
import {
  describeSnapshotError,
  reportSnapshotError,
  SnapshotUsageError,
} from './errors.js';
import { snapshotFlags } from './flags.js';
import { openSnapshotRenderer } from './page.js';
import { findChangedProjects } from './projects.js';

type Flags = Command.Command.Config.Infer<typeof snapshotFlags>;

interface Target {
  readonly project: string;
  readonly dir: string;
  readonly title: string;
  readonly out: string;
}

export const snapshotCommand = Command.make(
  'snapshot',
  snapshotFlags,
  Effect.fn(function* (flags) {
    if (!flags.all) {
      const [drawn] = yield* draw([yield* singleTarget(flags)], flags);
      yield* Console.log(JSON.stringify(drawn, null, 2));
      return;
    }
    const targets = yield* allTargets(flags);
    const planned = yield* draw(targets, flags, { keepGoing: true });
    yield* Console.log(JSON.stringify(planned, null, 2));
    if (planned.some((entry) => 'error' in entry)) process.exitCode = 1;
  }, Effect.catch(reportSnapshotError)),
).pipe(
  Command.withDescription(
    'Draw the changed Modules of one Project, or of every changed Project with --all, to PNG with headless Chromium, without a server',
  ),
);

function singleTarget(flags: Flags) {
  if (Option.isSome(flags.outDir)) {
    return Effect.fail(
      new SnapshotUsageError({ message: '--out-dir needs --all.' }),
    );
  }
  const project = Option.getOrElse(flags.project, () => '.');
  const dir = resolve(project);
  return Effect.succeed<Target>({
    project,
    dir,
    title: Option.getOrElse(flags.title, () => basename(dir)),
    out: resolve(Option.getOrElse(flags.out, () => 'laymos-snapshot.png')),
  });
}

function allTargets(flags: Flags) {
  return Effect.gen(function* () {
    for (const [name, value] of [
      ['--project', flags.project],
      ['--out', flags.out],
      ['--title', flags.title],
    ] as const) {
      if (Option.isSome(value)) {
        return yield* new SnapshotUsageError({
          message: `${name} draws one Project and cannot be combined with --all; run from the folder to search instead.`,
        });
      }
    }
    const root = process.cwd();
    const outDir = resolve(Option.getOrElse(flags.outDir, () => '.snapshots'));
    const dirs = yield* findChangedProjects(root, flags.base);
    return dirs.map((dir): Target => ({
      project: dir,
      dir: resolve(root, dir),
      title: dir === '.' ? basename(root) : dir,
      out: join(outDir, `${projectFileStem(dir, basename(root))}.png`),
    }));
  });
}

function draw(
  targets: readonly Target[],
  flags: Flags,
  options: { readonly keepGoing: boolean } = { keepGoing: false },
) {
  const settle = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<Result.Result<A, E>, E, R> =>
    options.keepGoing
      ? Effect.result(effect)
      : Effect.map(
          effect,
          (value) => Result.succeed(value) as Result.Result<A, E>,
        );
  return Effect.gen(function* () {
    const plans = yield* Effect.forEach(targets, (target) =>
      settle(planTarget(target, flags)),
    );
    const pending = plans.some(
      (plan) => Result.isSuccess(plan) && plan.success.plan.drawn !== 'none',
    );
    const render = pending
      ? yield* openSnapshotRenderer({
          scale: flags.scale,
          uiRoot: Option.getOrUndefined(flags.uiRoot),
          browser: Option.getOrUndefined(flags.browser),
          timeoutMs: flags.timeout,
        })
      : undefined;
    return yield* Effect.forEach(targets, (target, index) => {
      const plan = plans[index]!;
      if (Result.isFailure(plan)) {
        return Effect.succeed(failed(target, plan.failure));
      }
      return settle(drawTarget(plan.success, flags, render)).pipe(
        Effect.map((drawn) =>
          Result.isSuccess(drawn)
            ? drawn.success
            : failed(target, drawn.failure),
        ),
      );
    });
  }).pipe(Effect.scoped);
}

function planTarget(target: Target, flags: Flags) {
  return Effect.gen(function* () {
    const analysis = yield* analyzeProject(
      join(target.dir, 'laymos.config.json'),
    );
    const plan = planSnapshot(
      analysis,
      yield* loadChangeSet(target.dir, flags.base),
      flags,
    );
    return { target, analysis, plan };
  });
}

function drawTarget(
  { target, analysis, plan }: Effect.Success<ReturnType<typeof planTarget>>,
  flags: Flags,
  render: Effect.Success<ReturnType<typeof openSnapshotRenderer>> | undefined,
) {
  const summary = {
    project: target.project,
    title: target.title,
    baseRef: plan.changes.baseRef,
    modules: plan.modules,
    changedModules: plan.changedModules,
    drawn: plan.drawn,
    scale: flags.scale,
  };
  if (plan.drawn === 'none' || render === undefined) {
    return Effect.succeed({ ...summary, images: [] });
  }
  return Effect.forEach(themesFor(flags.theme), (theme) =>
    Effect.gen(function* () {
      const rendered = yield* render({
        title: target.title,
        theme,
        includeUnchanged: plan.drawn === 'all',
        maxWidth: flags.maxWidth,
        maxHeight: flags.maxHeight,
        analysis,
        changes: plan.changes,
        baseLabel: flags.base,
      });
      const out = themedPath(target.out, theme, flags.theme);
      yield* Effect.tryPromise(async () => {
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, rendered.png);
      });
      return {
        theme,
        out,
        width: rendered.width,
        height: rendered.height,
      };
    }),
  ).pipe(Effect.map((images) => ({ ...summary, images })));
}

function failed(target: Target, error: unknown) {
  return { project: target.project, error: describeSnapshotError(error) };
}
