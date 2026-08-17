import { Effect } from 'effect';
import type { FileDiff } from 'laymos';

import type { ChangeIndex } from '../changes';
import type { Layer } from '../layers/model';
import type { Module } from '../modules/model';

const addedModuleIds = new Set([
  'packages/experience/navigation',
  'packages/commerce/shared-domain',
]);

const modifiedModuleIds = new Set([
  'packages/experience/shell',
  'packages/commerce/application',
  'packages/commerce/domain',
  'services/commerce/workflows',
]);

export function withChangeStatus(
  modules: readonly Module[],
): readonly Module[] {
  return modules.map((module) =>
    addedModuleIds.has(module.id)
      ? { ...module, changeStatus: 'added' as const }
      : modifiedModuleIds.has(module.id)
        ? { ...module, changeStatus: 'modified' as const }
        : module,
  );
}

export function withLayerChangeStatus(
  layers: readonly Layer[],
  modules: readonly Module[],
): readonly Layer[] {
  const changedLayerIds = new Set(
    modules
      .filter(({ changeStatus }) => changeStatus !== undefined)
      .map(({ layerId }) => layerId),
  );
  return layers.map((layer) =>
    changedLayerIds.has(layer.id)
      ? { ...layer, changeStatus: 'modified' as const }
      : layer,
  );
}

export const fixtureChangeIndex: ChangeIndex = {
  baseRef: 'main',
  files: new Map([
    ...[...addedModuleIds].flatMap(
      (id) =>
        [
          [`${id}/index.ts`, 'added'],
          [`${id}/internal.ts`, 'added'],
        ] as const,
    ),
    ...[...modifiedModuleIds].map(
      (id) => [`${id}/index.ts`, 'modified'] as const,
    ),
  ]),
  modules: new Map([
    ...[...addedModuleIds].map((id) => [id, 'added'] as const),
    ...[...modifiedModuleIds].map((id) => [id, 'modified'] as const),
  ]),
  layers: new Map(),
};

const before = [
  "import { Effect } from 'effect';",
  '',
  'export interface ShellOptions {',
  '  readonly title: string;',
  '}',
  '',
  'export function createShell(options: ShellOptions) {',
  '  return Effect.succeed(options.title);',
  '}',
  '',
  'export const defaultShell = createShell({ title: "Shell" });',
];

const after = [
  "import { Effect } from 'effect';",
  '',
  'export interface ShellOptions {',
  '  readonly title: string;',
  '  readonly subtitle?: string;',
  '}',
  '',
  'export function createShell(options: ShellOptions) {',
  '  return Effect.succeed(options.subtitle ?? options.title);',
  '}',
  '',
  'export const defaultShell = createShell({ title: "Shell" });',
];

export const loadFixtureFileDiff = (path: string) =>
  Effect.succeed<FileDiff>({
    path,
    hunks: path.endsWith('index.ts')
      ? [
          {
            header: `@@ -1,${before.length} +1,${after.length} @@`,
            oldStart: 1,
            newStart: 1,
            lines: [
              ...before.slice(0, 4).map((content, index) => ({
                kind: 'context' as const,
                content,
                oldNumber: index + 1,
                newNumber: index + 1,
              })),
              {
                kind: 'added' as const,
                content: '  readonly subtitle?: string;',
                newNumber: 5,
              },
              ...before.slice(4, 7).map((content, index) => ({
                kind: 'context' as const,
                content,
                oldNumber: index + 5,
                newNumber: index + 6,
              })),
              {
                kind: 'removed' as const,
                content: '  return Effect.succeed(options.title);',
                oldNumber: 8,
              },
              {
                kind: 'added' as const,
                content:
                  '  return Effect.succeed(options.subtitle ?? options.title);',
                newNumber: 9,
              },
              ...before.slice(8).map((content, index) => ({
                kind: 'context' as const,
                content,
                oldNumber: index + 9,
                newNumber: index + 10,
              })),
            ],
          },
        ]
      : [],
  });
