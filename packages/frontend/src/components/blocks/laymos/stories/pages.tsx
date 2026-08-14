import type { StoryTree } from 'laymos';

import { cn } from '#lib/utils';

import {
  groupVerdict,
  type StoryLeaf,
  type StoryReports,
  type TreeNode,
} from './model';
import {
  Markdown,
  StatusIcon,
  StoryReportBody,
  type Verdict,
} from './timeline';

export function NodePage({
  node,
  reports,
  onSelect,
}: {
  readonly node: TreeNode;
  readonly reports?: StoryReports;
  readonly onSelect: (id: string) => void;
}) {
  return node.kind === 'group' ? (
    <GroupPage
      id={node.id}
      group={node.group}
      reports={reports}
      onSelect={onSelect}
    />
  ) : (
    <StoryPage story={node.story} reports={reports} />
  );
}

function GroupPage({
  id,
  group,
  reports,
  onSelect,
}: {
  readonly id: string;
  readonly group: StoryTree;
  readonly reports?: StoryReports;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title={group.title}
        description={group.description}
        verdict={groupVerdict(group, reports)}
      />
      <Markdown className="text-foreground/80">{group.markdown}</Markdown>
      <div className="flex flex-col gap-2.5">
        {group.groups.map((child) => (
          <ChildCard
            key={child.title}
            title={child.title}
            description={child.description}
            verdict={groupVerdict(child, reports)}
            count={countStories(child)}
            onOpen={() => onSelect(`${id}/${child.title}`)}
          />
        ))}
        {group.stories.map((story) => (
          <ChildCard
            key={story.id}
            title={story.title}
            description={story.description}
            verdict={reports?.[story.id]?.verdict}
            onOpen={() => onSelect(story.id)}
          />
        ))}
      </div>
    </div>
  );
}

function countStories(group: StoryTree): number {
  return (
    group.stories.length +
    group.groups.reduce((sum, child) => sum + countStories(child), 0)
  );
}

function StoryPage({
  story,
  reports,
}: {
  readonly story: StoryLeaf;
  readonly reports?: StoryReports;
}) {
  const report = reports?.[story.id];
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title={story.title}
        description={story.description}
        verdict={report?.verdict}
      />
      <Markdown className="text-foreground/80">{story.markdown}</Markdown>
      {report !== undefined && <StoryReportBody report={report} />}
    </div>
  );
}

function PageHeading({
  title,
  description,
  verdict,
}: {
  readonly title: string;
  readonly description: string;
  readonly verdict?: Verdict;
}) {
  return (
    <header className="flex flex-col gap-1.5 border-b border-border/60 pb-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-xl font-semibold leading-tight tracking-tight">
          {title}
        </h2>
        {verdict !== undefined && <StatusIcon verdict={verdict} />}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

function ChildCard({
  title,
  description,
  verdict,
  count,
  onOpen,
}: {
  readonly title: string;
  readonly description: string;
  readonly verdict?: Verdict;
  readonly count?: number;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 text-left shadow-sm',
        'transition-colors hover:border-primary/40 hover:bg-accent/40',
      )}
    >
      <StatusIcon verdict={verdict} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium leading-snug">{title}</span>
        <span className="truncate text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      {count !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {count} stor{count === 1 ? 'y' : 'ies'}
        </span>
      )}
      <span className="shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5">
        ›
      </span>
    </button>
  );
}
