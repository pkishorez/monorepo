import * as colors from 'yoctocolors';

import type { StoryTree, StoryTreeGroup } from '../../../story/schema/index.js';

export function renderStoriesReport(tree: StoryTree): string {
  const missing = groupsWithoutPage(tree, []);
  if (missing.length === 0) {
    return colors.green('✓ Every Story Group has a page');
  }
  return [
    colors.red('Story Groups without a page'),
    '',
    ...missing.map((id) => `  ${colors.yellow('✕')} ${id}`),
    '',
    `${missing.length} ${missing.length === 1 ? 'group' : 'groups'}`,
  ].join('\n');
}

export function countGroupsWithoutPage(tree: StoryTree): number {
  return groupsWithoutPage(tree, []).length;
}

function groupsWithoutPage(
  group: StoryTreeGroup,
  path: readonly string[],
): readonly string[] {
  const id = [...path, group.title];
  return [
    ...(group.page === null ? [id.join('/')] : []),
    ...group.groups.flatMap((child) => groupsWithoutPage(child, id)),
  ];
}
