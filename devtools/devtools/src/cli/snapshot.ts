import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { Config, Console, Effect, Option, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import {
  analyzeProject,
  ConfigError,
  CruiseError,
  GitError,
  loadChangeSet,
  type ArchitectureAnalysis,
  type ChangeSet,
} from 'laymos';

import { SnapshotRequestJson, type SnapshotRequest } from '../rpc/index.js';
import { renderSnapshot, SnapshotRenderError } from './snapshot-render.js';

const project = Flag.directory('project', { mustExist: true }).pipe(
  Flag.withDescription('Project folder holding laymos.config.json'),
  Flag.withDefault('.'),
);
const base = Flag.string('base').pipe(
  Flag.withDescription(
    'Base ref to mark changes against, such as origin/main; HEAD marks uncommitted work',
  ),
  Flag.withDefault('HEAD'),
);
const out = Flag.file('out').pipe(
  Flag.withAlias('o'),
  Flag.withDescription('PNG file to write'),
  Flag.withDefault('laymos-snapshot.png'),
);
const title = Flag.string('title').pipe(
  Flag.withDescription(
    'Caption above the drawing; defaults to the folder name',
  ),
  Flag.optional,
);
const includeUnchanged = Flag.boolean('include-unchanged').pipe(
  Flag.withDescription(
    'Draw every Module, not only the changed ones and their Layers',
  ),
  Flag.withDefault(false),
);
const onlyChanged = Flag.boolean('only-changed').pipe(
  Flag.withDescription(
    'Write nothing when no Module changed, instead of drawing them all',
  ),
  Flag.withDefault(false),
);
const maxWidth = Flag.integer('max-width').pipe(
  Flag.withDescription('Largest canvas width in CSS pixels'),
  Flag.withDefault(1600),
);
const maxHeight = Flag.integer('max-height').pipe(
  Flag.withDescription('Largest canvas height in CSS pixels'),
  Flag.withDefault(1600),
);
const scale = Flag.integer('scale').pipe(
  Flag.withDescription('Device pixels per CSS pixel in the PNG'),
  Flag.withDefault(2),
);
const theme = Flag.choice('theme', ['light', 'dark']).pipe(
  Flag.withDescription('Color theme of the drawing'),
  Flag.withDefault('light' as const),
);
const browser = Flag.string('browser').pipe(
  Flag.withDescription(
    'Chrome or Chromium executable to run instead of what Playwright finds',
  ),
  Flag.withFallbackConfig(Config.string('DEVTOOLS_BROWSER')),
  Flag.optional,
);
const uiRoot = Flag.directory('ui-root').pipe(
  Flag.withDescription('Folder holding the built DevTools page'),
  Flag.withFallbackConfig(Config.string('DEVTOOLS_UI_ROOT')),
  Flag.optional,
);
const timeout = Flag.integer('timeout').pipe(
  Flag.withDescription('Milliseconds to wait for the drawing to settle'),
  Flag.withDefault(30_000),
);

export const snapshotCommand = Command.make(
  'snapshot',
  {
    project,
    base,
    out,
    title,
    includeUnchanged,
    onlyChanged,
    maxWidth,
    maxHeight,
    scale,
    theme,
    browser,
    uiRoot,
    timeout,
  },
  Effect.fn(function* (flags) {
    const projectDir = resolve(flags.project);
    const configPath = join(projectDir, 'laymos.config.json');
    const analysis = yield* analyzeProject(configPath);
    const changes = yield* loadChangeSet(configPath, flags.base);
    const changedModules = countChangedModules(analysis, changes);
    const summary = {
      baseRef: changes.baseRef,
      modules: analysis.moduleAnalysis.modules.length,
      changedModules,
    };
    if (flags.onlyChanged && changedModules === 0) {
      yield* Console.log(
        JSON.stringify({ ...summary, drawn: 'none' }, null, 2),
      );
      return;
    }
    const request: SnapshotRequest = {
      title: Option.getOrElse(flags.title, () => basename(projectDir)),
      theme: flags.theme,
      includeUnchanged: flags.includeUnchanged,
      maxWidth: flags.maxWidth,
      maxHeight: flags.maxHeight,
      analysis,
      changes,
      baseLabel: flags.base,
    };
    const rendered = yield* renderSnapshot({
      payload: Schema.encodeSync(SnapshotRequestJson)(request),
      theme: flags.theme,
      maxWidth: flags.maxWidth,
      maxHeight: flags.maxHeight,
      scale: flags.scale,
      uiRoot: Option.getOrUndefined(flags.uiRoot),
      browser: Option.getOrUndefined(flags.browser),
      timeoutMs: flags.timeout,
    });
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
          drawn:
            flags.includeUnchanged || changedModules === 0 ? 'all' : 'changed',
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

// Analysis, git, browser, and file failures all end the command the same way:
// one line on stderr and a failed exit, like the Client Commands.
function reportSnapshotError(error: unknown) {
  return Console.error(describeSnapshotError(error)).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );
}

function describeSnapshotError(error: unknown): string {
  if (error instanceof SnapshotRenderError) return error.message;
  if (error instanceof ConfigError) {
    return error.reason === 'validation'
      ? [
          `Invalid config: ${error.filePath}`,
          ...error.issues.map((issue) => `  \u2715 ${issue.message}`),
        ].join('\n')
      : `Could not ${error.reason} config: ${error.filePath}`;
  }
  if (error instanceof CruiseError) {
    return `Could not analyze source files beneath: ${error.baseDir}`;
  }
  if (error instanceof GitError) {
    switch (error.reason) {
      case 'not-a-repo':
        return `${error.baseDir} is not inside a git repository.`;
      case 'unknown-ref':
        return `git does not know the base ref; fetch it first.`;
      case 'command-failed':
        return `git failed in ${error.baseDir}: ${String(error.cause)}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

// The Modules a Change set touches, by the analysis's own file membership.
function countChangedModules(
  analysis: ArchitectureAnalysis,
  changes: ChangeSet,
): number {
  const touched = new Set<string>();
  for (const { path } of changes.files) {
    const owner = analysis.moduleAnalysis.membership.get(path);
    if (owner !== undefined) touched.add(owner);
  }
  return touched.size;
}
