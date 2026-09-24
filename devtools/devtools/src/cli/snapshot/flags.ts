import { Config } from 'effect';
import { Flag } from 'effect/unstable/cli';

import { snapshotThemeChoices } from '../../domain/snapshot/index.js';

const project = Flag.directory('project', { mustExist: true }).pipe(
  Flag.withDescription('Project folder holding laymos.config.json; default .'),
  Flag.optional,
);
const all = Flag.boolean('all').pipe(
  Flag.withDescription(
    'Draw every Project under the current folder that the commits changed, skipping fixtures and git-ignored folders',
  ),
  Flag.withDefault(false),
);
const base = Flag.string('base').pipe(
  Flag.withDescription(
    'Base ref to mark committed changes against, such as origin/main',
  ),
  Flag.withDefault('main'),
);
const out = Flag.file('out').pipe(
  Flag.withAlias('o'),
  Flag.withDescription('PNG file to write; default laymos-snapshot.png'),
  Flag.optional,
);
const outDir = Flag.string('out-dir').pipe(
  Flag.withDescription(
    'With --all, the folder for one PNG per Project; default .snapshots',
  ),
  Flag.optional,
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
const theme = Flag.choice('theme', snapshotThemeChoices).pipe(
  Flag.withDescription(
    'Color theme of the drawing: dark, light, or both as -dark and -light files',
  ),
  Flag.withFallbackConfig(
    Config.literals(snapshotThemeChoices, 'DEVTOOLS_THEME'),
  ),
  Flag.withDefault(snapshotThemeChoices[0]),
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

export const snapshotFlags = {
  project,
  all,
  base,
  out,
  outDir,
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
};
