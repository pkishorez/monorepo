import { useState, type ReactNode } from 'react';
import { FileText, Maximize2 } from 'lucide-react';
import type { StoryTree } from 'laymos';

import { SourceViewer } from '../../source-viewer/index';
import { Button } from '#components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '#components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import {
  groupVerdict,
  type StoryDocLeaf,
  type StoryLeaf,
  type StoryReports,
  type TreeNode,
} from './model';
import {
  Markdown,
  StatusIcon,
  StoryReportBody,
  VerdictDot,
  type Verdict,
} from './timeline';

export function NodePage({
  node,
  reports,
  running,
  onRun,
  onSelect,
}: {
  readonly node: TreeNode;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
  readonly onSelect: (id: string) => void;
}) {
  switch (node.kind) {
    case 'group':
      return (
        <GroupPage
          id={node.id}
          group={node.group}
          reports={reports}
          running={running}
          onRun={onRun}
          onSelect={onSelect}
        />
      );
    case 'doc':
      return <DocPage doc={node.doc} />;
    case 'story':
      return (
        <StoryPage
          story={node.story}
          reports={reports}
          running={running}
          onRun={onRun}
        />
      );
  }
}

function GroupPage({
  id,
  group,
  reports,
  running,
  onRun,
  onSelect,
}: {
  readonly id: string;
  readonly group: StoryTree;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
  readonly onSelect: (id: string) => void;
}) {
  const [dialogStory, setDialogStory] = useState<StoryLeaf | null>(null);
  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={group.title}
        description={group.description}
        verdict={groupVerdict(group, reports)}
      />
      <Markdown>{group.markdown}</Markdown>
      <div className="overflow-hidden rounded-lg border border-border">
        {group.docs.map((doc) => (
          <ChildRow
            key={doc.id}
            title={doc.title}
            description={doc.description}
            doc
            onOpen={() => onSelect(doc.id)}
          />
        ))}
        {group.groups.map((child) => (
          <ChildRow
            key={child.title}
            title={child.title}
            description={child.description}
            verdict={groupVerdict(child, reports)}
            count={countStories(child)}
            onOpen={() => onSelect(`${id}/${child.title}`)}
          />
        ))}
        {group.stories.map((story) => (
          <ChildRow
            key={story.id}
            title={story.title}
            description={story.description}
            verdict={reports?.[story.id]?.verdict}
            onOpen={() => onSelect(story.id)}
            onOpenDialog={() => setDialogStory(story)}
          />
        ))}
      </div>
      {dialogStory !== null && (
        <StoryDialog
          story={dialogStory}
          reports={reports}
          running={running}
          onRun={onRun}
          onClose={() => setDialogStory(null)}
        />
      )}
    </div>
  );
}

function countStories(group: StoryTree): number {
  return (
    group.stories.length +
    group.groups.reduce((sum, child) => sum + countStories(child), 0)
  );
}

function DocPage({ doc }: { readonly doc: StoryDocLeaf }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeading title={doc.title} description={doc.description} />
      <Markdown>{doc.markdown}</Markdown>
    </div>
  );
}

function StoryPage({
  story,
  reports,
  running,
  onRun,
}: {
  readonly story: StoryLeaf;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const report = reports?.[story.id];
  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={story.title}
        description={story.description}
        verdict={report?.verdict}
        actions={
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setDialogOpen(true)}
            title="Open in dialog"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        }
      />
      <StoryBody story={story} reports={reports} />
      {dialogOpen && (
        <StoryDialog
          story={story}
          reports={reports}
          running={running}
          onRun={onRun}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

function StoryBody({
  story,
  reports,
}: {
  readonly story: StoryLeaf;
  readonly reports?: StoryReports;
}) {
  const report = reports?.[story.id];
  return (
    <div className="flex flex-col gap-5">
      {story.source === undefined ? (
        <Markdown>{story.markdown}</Markdown>
      ) : (
        <Tabs defaultValue="story" className="gap-4">
          <TabsList
            variant="line"
            className="w-full justify-start border-b border-border/60"
          >
            <TabsTrigger value="story" className="flex-none px-1">
              Story
            </TabsTrigger>
            <TabsTrigger value="code" className="flex-none px-1">
              Code
            </TabsTrigger>
          </TabsList>
          <TabsContent value="story">
            <Markdown>{story.markdown}</Markdown>
          </TabsContent>
          <TabsContent value="code">
            <StorySource source={story.source} />
          </TabsContent>
        </Tabs>
      )}
      {report !== undefined && <StoryReportBody report={report} />}
    </div>
  );
}

function StorySource({
  source,
}: {
  readonly source: NonNullable<StoryLeaf['source']>;
}) {
  const [showMarkdown, setShowMarkdown] = useState(false);
  const condensed = collapseMarkdownFields(source.content);
  const collapsible = condensed !== source.content;
  return (
    <SourceViewer
      filePath={source.path}
      content={showMarkdown || !collapsible ? source.content : condensed}
      autoHeight
      className="rounded-lg border border-border"
      actions={
        collapsible ? (
          <button
            type="button"
            onClick={() => setShowMarkdown((value) => !value)}
            className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showMarkdown ? 'Hide markdown' : 'Show markdown'}
          </button>
        ) : undefined
      }
    />
  );
}

function collapseMarkdownFields(content: string): string {
  return content.replace(/markdown: `(?:\\.|[^`\\])*`/g, "markdown: '…'");
}

function StoryDialog({
  story,
  reports,
  running,
  onRun,
  onClose,
}: {
  readonly story: StoryLeaf;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
  readonly onClose: () => void;
}) {
  const report = reports?.[story.id];
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[min(92vw,64rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[64rem]">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-3 pr-14">
          <StatusIcon verdict={report?.verdict} />
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
            {story.title}
          </DialogTitle>
          {onRun !== undefined && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRun(story.id)}
              disabled={running === true}
            >
              Run
            </Button>
          )}
        </div>
        <div
          className={cn('flex-1 overflow-y-auto px-5 py-4', scrollbarStyles)}
        >
          <StoryBody story={story} reports={reports} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PageHeading({
  title,
  description,
  verdict,
  actions,
}: {
  readonly title: string;
  readonly description: string;
  readonly verdict?: Verdict;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        {verdict !== undefined && <VerdictDot verdict={verdict} />}
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {actions}
      </div>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </header>
  );
}

function ChildRow({
  title,
  description,
  verdict,
  doc = false,
  count,
  onOpen,
  onOpenDialog,
}: {
  readonly title: string;
  readonly description: string;
  readonly verdict?: Verdict;
  readonly doc?: boolean;
  readonly count?: number;
  readonly onOpen: () => void;
  readonly onOpenDialog?: () => void;
}) {
  return (
    <div className="group flex items-center border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/40">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-baseline gap-2.5 px-3.5 py-2.5 text-left"
      >
        <span className="shrink-0 self-center">
          {doc ? (
            <FileText className="size-3.5 text-muted-foreground/70" />
          ) : (
            <VerdictDot verdict={verdict} />
          )}
        </span>
        <span className="shrink-0 text-sm font-medium leading-snug">
          {title}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs leading-snug text-muted-foreground">
          {description}
        </span>
        {count !== undefined && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
            {count}
          </span>
        )}
      </button>
      {onOpenDialog !== undefined && (
        <button
          type="button"
          onClick={onOpenDialog}
          title="Open in dialog"
          className="mr-2 rounded-md p-1.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <Maximize2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}
