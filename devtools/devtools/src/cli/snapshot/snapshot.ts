import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { Console, Effect, Option } from 'effect';
import { Command } from 'effect/unstable/cli';
import { analyzeProject, loadChangeSet } from 'laymos';

import { planSnapshot } from '../../domain/snapshot/index.js';
import { reportSnapshotError } from './errors.js';
import { snapshotFlags } from './flags.js';
import { renderSnapshot } from './page.js';

export const snapshotCommand = Command.make(
  'snapshot',
  snapshotFlags,
  Effect.fn(function* (flags) {
    const projectDir = resolve(flags.project);
    const configPath = join(projectDir, 'laymos.config.json');
    const analysis = yield* analyzeProject(configPath);
    const plan = planSnapshot(
      analysis,
      yield* loadChangeSet(projectDir, flags.base),
      flags,
    );
    const summary = {
      baseRef: plan.changes.baseRef,
      modules: plan.modules,
      changedModules: plan.changedModules,
    };
    if (plan.drawn === 'none') {
      yield* Console.log(
        JSON.stringify({ ...summary, drawn: plan.drawn }, null, 2),
      );
      return;
    }
    const rendered = yield* renderSnapshot(
      {
        title: Option.getOrElse(flags.title, () => basename(projectDir)),
        theme: flags.theme,
        includeUnchanged: plan.drawn === 'all',
        maxWidth: flags.maxWidth,
        maxHeight: flags.maxHeight,
        analysis,
        changes: plan.changes,
        baseLabel: flags.base,
      },
      {
        scale: flags.scale,
        uiRoot: Option.getOrUndefined(flags.uiRoot),
        browser: Option.getOrUndefined(flags.browser),
        timeoutMs: flags.timeout,
      },
    );
    const outPath = resolve(flags.out);
    yield* Effect.tryPromise(async () => {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, rendered.png);
    });
    yield* Console.log(
      JSON.stringify(
        {
          ...summary,
          out: outPath,
          width: rendered.width,
          height: rendered.height,
          scale: flags.scale,
          drawn: plan.drawn,
        },
        null,
        2,
      ),
    );
  }, Effect.catch(reportSnapshotError)),
).pipe(
  Command.withDescription(
    'Draw a Project’s changed Modules to a PNG with headless Chromium, without a server',
  ),
);
