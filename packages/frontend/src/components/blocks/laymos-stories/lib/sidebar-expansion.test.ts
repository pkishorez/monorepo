import { describe, expect, it } from 'vitest';

import { storyGroupKey, type StoryGroupEntry } from './model';
import {
  initialSidebarExpandedGroups,
  sidebarExpandedGroups,
  sidebarGroupAncestry,
} from './sidebar-expansion';

const group = {
  path: ['Commerce', 'Orders'],
  name: 'Orders',
  description: '',
  stories: [],
  descendantStoryIds: [],
  groups: [
    {
      path: ['Commerce', 'Orders', 'Returns'],
      name: 'Returns',
      description: '',
      stories: [],
      descendantStoryIds: [],
      groups: [
        {
          path: ['Commerce', 'Orders', 'Returns', 'International'],
          name: 'International',
          description: '',
          stories: [],
          descendantStoryIds: [],
          groups: [],
        },
      ],
    },
  ],
} satisfies StoryGroupEntry;

describe('sidebar expansion', () => {
  it('keeps only the selected branch open by default', () => {
    expect([...sidebarExpandedGroups(group, false)]).toEqual([
      storyGroupKey(['Commerce']),
      storyGroupKey(['Commerce', 'Orders']),
    ]);
  });

  it('can open every nested group in the selected branch', () => {
    expect([...sidebarExpandedGroups(group, true)]).toEqual([
      storyGroupKey(['Commerce']),
      storyGroupKey(['Commerce', 'Orders']),
      storyGroupKey(['Commerce', 'Orders', 'Returns']),
      storyGroupKey(['Commerce', 'Orders', 'Returns', 'International']),
    ]);
  });

  it('can retain only the ancestors when collapsing a group', () => {
    expect([...sidebarGroupAncestry(group.path, false)]).toEqual([
      storyGroupKey(['Commerce']),
    ]);
  });

  it('opens the first folder branch until Stories are visible', () => {
    const root = {
      ...group,
      path: ['Commerce'],
      stories: [],
      groups: [
        {
          ...group,
          stories: [
            {
              storyId: 'checkout',
              name: 'Checkout',
              description: '',
              groupPath: group.path,
              scenarios: [],
            },
          ],
        },
      ],
    } satisfies StoryGroupEntry;

    const support = {
      ...group,
      path: ['Support'],
      name: 'Support',
      groups: [],
    } satisfies StoryGroupEntry;

    expect([...initialSidebarExpandedGroups([root, support])]).toEqual([
      storyGroupKey(['Commerce']),
      storyGroupKey(['Support']),
      storyGroupKey(['Commerce', 'Orders']),
    ]);
  });
});
