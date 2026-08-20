import type { StoryReport, StoryTree } from 'laymos';

export type StoryReports = Readonly<Record<string, StoryReport>>;

export interface StoriesViewProps {
  readonly tree: StoryTree;
  readonly reports?: StoryReports;
  readonly changedPaths?: ReadonlyMap<string, 'added' | 'modified'>;
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

export function isChapter(group: StoryTree): boolean {
  return group.groups.length === 0 && group.stories.length > 0;
}

export function countQuestions(group: StoryTree): number {
  return (
    group.stories.reduce((sum, story) => sum + story.questions.length, 0) +
    group.groups.reduce((sum, child) => sum + countQuestions(child), 0)
  );
}

export function splitSpine(stories: readonly StoryLeaf[]): {
  readonly spine: readonly StoryLeaf[];
  readonly depth: readonly StoryLeaf[];
} {
  const spine = stories.filter((story) => story.spine);
  // A group with nothing on the spine has no depth to hide.
  if (spine.length === 0) return { spine: stories, depth: [] };
  return { spine, depth: stories.filter((story) => !story.spine) };
}

export function storyAnchor(story: StoryLeaf): string {
  return story.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

export type StoryChange =
  | { readonly status: 'added' }
  | { readonly status: 'modified'; readonly supportOnly: boolean };

export type ChangedPaths = ReadonlyMap<string, 'added' | 'modified'>;

export function storyChange(
  story: StoryLeaf,
  changed: ChangedPaths,
): StoryChange | undefined {
  const own = changed.get(story.source.path);
  if (own === 'added') return { status: 'added' };
  if (own === 'modified') return { status: 'modified', supportOnly: false };
  const support =
    story.support === null ? undefined : changed.get(story.support.path);
  return support === undefined
    ? undefined
    : { status: 'modified', supportOnly: true };
}

export function groupChange(
  group: StoryTree,
  changed: ChangedPaths,
): StoryChange | undefined {
  const changes = storyLeaves(group).map((story) =>
    storyChange(story, changed),
  );
  if (changes.every((change) => change === undefined)) return undefined;
  return changes.every((change) => change?.status === 'added')
    ? { status: 'added' }
    : { status: 'modified', supportOnly: false };
}

function storyLeaves(group: StoryTree): readonly StoryLeaf[] {
  return [...group.stories, ...group.groups.flatMap(storyLeaves)];
}
