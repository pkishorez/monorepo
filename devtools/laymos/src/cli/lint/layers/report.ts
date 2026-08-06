import * as colors from 'yoctocolors';

import type { LayerLintResult } from '../../../domain/layers/index.js';

export function renderLayerReport(result: LayerLintResult): string {
  const count = result.unassignedFiles.length + result.forbiddenImports.length;
  if (count === 0) return colors.green('✓ No layer violations');

  const sections = [
    colors.red('Layer violations'),
    ...renderForbiddenImports(result),
    ...renderUnassignedFiles(result.unassignedFiles),
    '',
    `${count} ${count === 1 ? 'violation' : 'violations'}`,
  ];
  return sections.join('\n');
}

function renderForbiddenImports(result: LayerLintResult): readonly string[] {
  const groups = new Map<string, typeof result.forbiddenImports>();
  for (const violation of result.forbiddenImports) {
    const key = `${violation.fromLayer}\0${violation.toLayer}`;
    groups.set(key, [...(groups.get(key) ?? []), violation]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, violations]) => {
      const [fromLayer, toLayer] = key.split('\0');
      return [
        '',
        `${fromLayer} → ${toLayer}`,
        ...[...violations]
          .sort((left, right) =>
            left.fromFile === right.fromFile
              ? left.toFile.localeCompare(right.toFile)
              : left.fromFile.localeCompare(right.fromFile),
          )
          .map(
            ({ fromFile, toFile }) =>
              `  ${colors.red('✕')} ${fromFile} → ${toFile}`,
          ),
      ];
    });
}

function renderUnassignedFiles(files: readonly string[]): readonly string[] {
  if (files.length === 0) return [];
  return [
    '',
    'unassigned files',
    ...[...files]
      .sort((left, right) => left.localeCompare(right))
      .map((file) => `  ${colors.yellow('✕')} ${file}`),
  ];
}
