import type { StoryGroupPath } from 'laymos/report';

import type { StoryGroupEntry } from './model';
import { storyGroupKey } from './model';

/** Returns the group keys needed to reveal a path in the sidebar. */
export function sidebarGroupAncestry(
  path: StoryGroupPath,
  includeGroup = true,
): ReadonlySet<string> {
  const end = includeGroup ? path.length : path.length - 1;
  return new Set(
    Array.from({ length: Math.max(0, end) }, (_, index) =>
      storyGroupKey(path.slice(0, index + 1)),
    ),
  );
}

/** Opens one group branch, optionally including every nested group. */
export function sidebarExpandedGroups(
  group: StoryGroupEntry,
  recursively: boolean,
): ReadonlySet<string> {
  const expanded = new Set(sidebarGroupAncestry(group.path));
  if (!recursively) return expanded;

  const addDescendants = (entry: StoryGroupEntry): void => {
    for (const child of entry.groups) {
      expanded.add(storyGroupKey(child.path));
      addDescendants(child);
    }
  };
  addDescendants(group);
  return expanded;
}

/** Opens the first folder branch until its first Stories are visible. */
export function initialSidebarExpandedGroups(
  groups: readonly StoryGroupEntry[],
): ReadonlySet<string> {
  const expanded = new Set(groups.map(({ path }) => storyGroupKey(path)));
  let group = groups[0];
  while (group !== undefined) {
    expanded.add(storyGroupKey(group.path));
    if (group.stories.length > 0) break;
    group = group.groups[0];
  }
  return expanded;
}
