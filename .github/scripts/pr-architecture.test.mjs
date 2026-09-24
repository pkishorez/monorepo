import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changedProjects,
  endMarker,
  renderSection,
  replaceSection,
  snapshotName,
  startMarker,
} from './pr-architecture.mjs';

const configs = [
  'devtools/laymos/laymos.config.json',
  'devtools/laymos/src/tests/fixtures/modules/valid/laymos.config.json',
  'toolkits/kui-toolkit/laymos.config.json',
];

test('maps changed files to the deepest Project that owns them', () => {
  assert.deepEqual(
    changedProjects(
      [
        'toolkits/kui-toolkit/src/a.ts',
        'devtools/laymos/src/tests/fixtures/modules/valid/src/x.ts',
        'devtools/devtools/src/b.ts',
        'README.md',
      ],
      configs,
    ),
    ['devtools/laymos', 'toolkits/kui-toolkit'],
  );
});

test('a root config owns every file', () => {
  assert.deepEqual(changedProjects(['src/a.ts'], ['laymos.config.json']), [
    '.',
  ]);
  assert.equal(snapshotName('.'), 'root.png');
  assert.equal(
    snapshotName('toolkits/kui-toolkit'),
    'toolkits-kui-toolkit.png',
  );
});

test('renders one image per drawn Project and explains failures', () => {
  const section = renderSection([
    {
      project: 'devtools/devtools',
      out: '.snapshots/devtools-devtools.png',
      drawn: 'changed',
      changedModules: 6,
      modules: 32,
      baseRef: 'main',
    },
    { project: 'apps/docs', error: 'No Chromium could be started.' },
    {
      project: 'devtools/flow',
      drawn: 'none',
      modules: 10,
      changedModules: 0,
      baseRef: 'main',
    },
  ]);
  assert.ok(section.startsWith(startMarker));
  assert.ok(section.endsWith(endMarker));
  assert.match(section, /6 of 32 modules changed since `main`/);
  assert.match(
    section,
    /!\[devtools\/devtools architecture\]\(\.snapshots\/devtools-devtools\.png\)/,
  );
  assert.match(section, /Could not draw this Project: No Chromium/);
  assert.match(section, /none of its 10 modules did since `main`/);
  assert.equal(section.match(/!\[/g).length, 1);
});

test('replaces an existing section in place and appends a missing one', () => {
  const section = renderSection([]);
  const stale = `Intro\n\n${startMarker}\nold\n${endMarker}\n\nOutro`;
  assert.equal(replaceSection(stale, section), `Intro\n\n${section}\n\nOutro`);
  assert.equal(replaceSection('Intro\n', section), `Intro\n\n${section}`);
  assert.equal(replaceSection('', section), section);
});
