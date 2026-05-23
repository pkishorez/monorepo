import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { resolve } from 'node:path';

import { cruise } from 'dependency-cruiser';
import type { ICruiseResult } from 'dependency-cruiser';

import { toDependencyCruiserConfig } from '../to-dependency-cruiser-config.js';
import { toVisualizationConfig } from '../to-visualization-config.js';
import type { DepcruiseVizResult } from '../types.js';

import { collectPaths } from './collect-paths.js';
import { loadConfig } from './load-config.js';

const CONFIG_PATH = resolve('depcruise.config.ts');

async function cruiseProject() {
  const rules = await loadConfig(CONFIG_PATH);
  const config = toDependencyCruiserConfig(rules);
  const visualization = toVisualizationConfig(rules);
  const sourcePaths = collectPaths(rules);
  const result = await cruise(sourcePaths, {
    ruleSet: config,
    validate: true,
  });

  return {
    config,
    visualization,
    cruiseResult: result.output,
  } satisfies DepcruiseVizResult;
}

async function viz(): Promise<void> {
  const output = await cruiseProject();

  const vizData = {
    config: output.config,
    visualization: output.visualization,
  };
  const hash = encodeURIComponent(JSON.stringify(vizData));
  const url = `http://localhost:20001/dep-cruiser#${hash}`;

  const openCmd =
    platform() === 'darwin'
      ? 'open'
      : platform() === 'win32'
        ? 'start'
        : 'xdg-open';

  exec(`${openCmd} '${url}'`);
  process.stdout.write(`${url}\n`);
}

async function lint(): Promise<void> {
  const output = await cruiseProject();
  const cruiseResult = output.cruiseResult as ICruiseResult;
  const { violations } = cruiseResult.summary;

  if (violations.length === 0) {
    process.stdout.write('No dependency violations found.\n');
    return;
  }

  process.stderr.write(
    `Found ${violations.length} dependency violation(s):\n\n`,
  );
  for (const v of violations) {
    process.stderr.write(`  ${v.rule.severity} ${v.rule.name}\n`);
    process.stderr.write(`    ${v.from} → ${v.to}\n\n`);
  }

  process.exit(1);
}

export async function run(): Promise<void> {
  const command = process.argv[2];

  if (command === 'lint') {
    await lint();
  } else {
    await viz();
  }
}
