import type { StoryReport, StoryTree } from 'laymos';

export type StoryReports = Readonly<Record<string, StoryReport>>;

export interface StoriesViewProps {
  readonly tree: StoryTree;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
  readonly className?: string;
}

export function storyIds(group: StoryTree): readonly string[] {
  return [
    ...group.stories.map(({ id }) => id),
    ...group.groups.flatMap(storyIds),
  ];
}

export function groupVerdict(
  group: StoryTree,
  reports: StoryReports | undefined,
): StoryReport['verdict'] | undefined {
  if (reports === undefined) return undefined;
  const verdicts = storyIds(group).map((id) => reports[id]?.verdict);
  if (
    verdicts.length === 0 ||
    verdicts.some((verdict) => verdict === undefined)
  ) {
    return undefined;
  }
  if (verdicts.includes('errored')) return 'errored';
  if (verdicts.includes('failed')) return 'failed';
  return 'passed';
}

export function runSummary(
  tree: StoryTree,
  reports: StoryReports | undefined,
): { total: number; passed: number; failed: number; errored: number } {
  const ids = storyIds(tree);
  const counts = { total: ids.length, passed: 0, failed: 0, errored: 0 };
  if (reports === undefined) return counts;
  for (const id of ids) {
    const verdict = reports[id]?.verdict;
    if (verdict !== undefined) counts[verdict] += 1;
  }
  return counts;
}

export type StoryLeaf = StoryTree['stories'][number];

export type TreeNode =
  | {
      readonly kind: 'group';
      readonly id: string;
      readonly group: StoryTree;
      readonly parentId?: string;
    }
  | {
      readonly kind: 'story';
      readonly id: string;
      readonly story: StoryLeaf;
      readonly parentId: string;
    };

export function indexTree(tree: StoryTree): ReadonlyMap<string, TreeNode> {
  const nodes = new Map<string, TreeNode>();
  const walk = (group: StoryTree, id: string, parentId?: string) => {
    nodes.set(id, { kind: 'group', id, group, parentId });
    for (const story of group.stories) {
      nodes.set(story.id, { kind: 'story', id: story.id, story, parentId: id });
    }
    for (const child of group.groups) {
      walk(child, `${id}/${child.title}`, id);
    }
  };
  walk(tree, tree.title);
  return nodes;
}
