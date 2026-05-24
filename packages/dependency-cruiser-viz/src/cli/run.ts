import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { resolve } from 'node:path';

import { cruise } from 'dependency-cruiser';
import type { ICruiseResult } from 'dependency-cruiser';

import { summarizeCruiseResult } from '../summarize-cruise-result.js';
import { toDependencyCruiserConfig } from '../to-dependency-cruiser-config.js';
import { toVisualizationConfig } from '../to-visualization-config.js';
import type { DepcruiseVizData, DepcruiseVizResult } from '../types.js';

import { loadConfig } from './load-config.js';

const CONFIG_PATH = resolve('depcruise.config.ts');

async function cruiseProject() {
  const projectConfig = await loadConfig(CONFIG_PATH);
  const dependencyCruiserConfig = toDependencyCruiserConfig(
    projectConfig.rules,
    projectConfig.features,
  );
  const config = toVisualizationConfig(projectConfig);
  const result = await cruise([projectConfig.rootDir], {
    ruleSet: dependencyCruiserConfig,
    validate: true,
  });

  const cruiseResult = result.output as ICruiseResult;
  const summary = summarizeCruiseResult(cruiseResult, config);

  return {
    dependencyCruiserConfig,
    config,
    summary,
  } satisfies DepcruiseVizResult;
}

async function viz(): Promise<void> {
  const output = await cruiseProject();

  const vizData: DepcruiseVizData = {
    config: output.config,
    summary: output.summary,
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
  const { violations, featureViolations = [] } = output.summary;
  const totalViolations = violations.length + featureViolations.length;

  if (totalViolations === 0) {
    process.stdout.write('No dependency violations found.\n');
    return;
  }

  process.stderr.write(`Found ${totalViolations} dependency violation(s):\n\n`);
  for (const v of violations) {
    process.stderr.write(`  ${v.severity} ${v.rule}\n`);
    process.stderr.write(`    ${v.from} → ${v.to}\n\n`);
  }
  for (const v of featureViolations) {
    process.stderr.write(`  ${v.severity} ${v.rule}\n`);
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
