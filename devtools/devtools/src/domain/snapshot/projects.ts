import { snapshotThemes } from './schema.js';

export const snapshotThemeChoices = [...snapshotThemes, 'both'] as const;
export type SnapshotThemeChoice = (typeof snapshotThemeChoices)[number];

export function themesFor(
  choice: SnapshotThemeChoice,
): ReadonlyArray<(typeof snapshotThemes)[number]> {
  return choice === 'both' ? snapshotThemes : [choice];
}

export function changedProjectDirs(
  projectDirs: readonly string[],
  changedPaths: readonly string[],
): string[] {
  return projectDirs.filter((dir) =>
    dir === '.'
      ? changedPaths.length > 0
      : changedPaths.some((path) => path.startsWith(`${dir}/`)),
  );
}

export function projectFileStem(dir: string, rootName: string): string {
  return encodeURIComponent(dir === '.' ? `${rootName}/` : dir);
}

export function themedPath(
  path: string,
  theme: (typeof snapshotThemes)[number],
  choice: SnapshotThemeChoice,
): string {
  if (choice !== 'both') return path;
  return path.endsWith('.png')
    ? `${path.slice(0, -'.png'.length)}-${theme}.png`
    : `${path}-${theme}`;
}
