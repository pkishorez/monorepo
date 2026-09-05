import { useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Link as LinkIcon,
  Maximize2,
  Minimize2,
  SquareArrowOutUpRight,
} from 'lucide-react';
import type { StoryTree } from 'laymos';

import { SourceViewer } from '../../source-viewer/index';
import { Button } from '#components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '#components/ui/dialog';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

import {
  countQuestions,
  groupVerdict,
  storyAnchor,
  type StoryLeaf,
  type StoryReports,
  type TreeNode,
} from './model';
import {
  CodeSnippet,
  Markdown,
  QuestionProof,
  StatusIcon,
  VerdictDot,
  type QuestionReport,
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
    case 'story':
      return (
        <StoryPage
          story={node.story}
          reports={reports}
          running={running}
          onRun={onRun}
          onSelect={onSelect}
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
  const storyRow = (story: StoryLeaf) => (
    <ChildRow
      key={story.id}
      title={story.title}
      description={story.description}
      verdict={reports?.[story.id]?.verdict}
      count={story.questions.length}
      onOpen={() => setDialogStory(story)}
      onOpenPage={() => onSelect(story.id)}
    />
  );
  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs id={id} onSelect={onSelect} />
      <PageHeading
        title={group.title}
        description={group.description}
        verdict={groupVerdict(group, reports)}
      />
      {group.page !== null && <Markdown>{group.page.content}</Markdown>}
      <div className="overflow-hidden rounded-lg border border-border">
        {group.groups.map((child) => (
          <ChildRow
            key={child.title}
            title={child.title}
            description={child.description}
            verdict={groupVerdict(child, reports)}
            count={countQuestions(child)}
            onOpen={() => onSelect(`${id}/${child.title}`)}
          />
        ))}
        {group.stories.map(storyRow)}
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

function StoryPage({
  story,
  reports,
  running,
  onRun,
  onSelect,
}: {
  readonly story: StoryLeaf;
  readonly reports?: StoryReports;
  readonly running?: boolean;
  readonly onRun?: (scope?: string) => void;
  readonly onSelect: (id: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const report = reports?.[story.id];
  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs id={story.id} onSelect={onSelect} />
      <PageHeading
        title={story.title}
        description={story.description}
        verdict={report?.verdict}
        actions={
          <>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setSourceOpen(true)}
              title="View source"
            >
              <FileCode2 className="size-3.5" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setDialogOpen(true)}
              title="Open in dialog"
            >
              <Maximize2 className="size-3.5" />
            </Button>
          </>
        }
      />
      {story.page !== null && <Markdown>{story.page.content}</Markdown>}
      <StoryBody
        story={story}
        reports={reports}
        anchorPrefix={storyAnchor(story)}
      />
      {sourceOpen && (
        <SourceDialog
          source={story.source}
          onClose={() => setSourceOpen(false)}
        />
      )}
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
  anchorPrefix,
}: {
  readonly story: StoryLeaf;
  readonly reports?: StoryReports;
  readonly anchorPrefix?: string;
}) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [setupExpanded, setSetupExpanded] = useState(false);
  const report = reports?.[story.id];
  const questionReports = new Map<string, QuestionReport>(
    (report?.questions ?? []).map((question) => [question.slug, question]),
  );
  const support = story.support;
  return (
    <div className="flex flex-col gap-4">
      {(story.setup !== null || support !== null) && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              setup
            </span>
            {story.setup !== null && (
              <button
                type="button"
                onClick={() => setSetupExpanded((value) => !value)}
                className="inline-flex items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {setupExpanded ? (
                  <Minimize2 className="size-3" />
                ) : (
                  <Maximize2 className="size-3" />
                )}
                {setupExpanded ? 'collapse' : 'expand'}
              </button>
            )}
            {support !== null && (
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                title={`View ${support.path}`}
                className="inline-flex items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <FileCode2 className="size-3" />
                {fileName(support.path)}
              </button>
            )}
          </div>
          {story.setup !== null && (
            <div
              className={cn(
                'overflow-auto rounded-lg',
                scrollbarStyles,
                setupExpanded ? 'max-h-[640px]' : 'max-h-[300px]',
              )}
            >
              <CodeSnippet code={story.setup} />
            </div>
          )}
        </div>
      )}
      {support !== null && supportOpen && (
        <SourceDialog source={support} onClose={() => setSupportOpen(false)} />
      )}
      {story.questions.map((question) => (
        <QuestionBlock
          key={question.slug}
          question={question}
          report={questionReports.get(question.slug)}
          anchorPrefix={anchorPrefix}
        />
      ))}
    </div>
  );
}

function QuestionBlock({
  question,
  report,
  anchorPrefix,
}: {
  readonly question: StoryLeaf['questions'][number];
  readonly report?: QuestionReport;
  readonly anchorPrefix?: string;
}) {
  const anchor =
    anchorPrefix === undefined
      ? question.slug
      : `${anchorPrefix}--${question.slug}`;
  const [open, setOpen] = useState(
    () =>
      typeof window !== 'undefined' && window.location.hash === `#${anchor}`,
  );
  return (
    <section
      id={anchor}
      className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card"
    >
      <header
        role="button"
        tabIndex={0}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        className={cn(
          'group flex cursor-pointer items-start gap-3 bg-muted/30 px-5 py-4 transition-colors hover:bg-muted/50',
          open && 'border-b border-border/60',
        )}
      >
        <StatusIcon verdict={report?.verdict} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Markdown className="prose-p:my-0 prose-headings:my-0 text-[15px] font-semibold leading-snug text-foreground">
            {question.question}
          </Markdown>
          <Markdown className="prose-p:my-1 prose-ol:my-1.5 prose-ol:pl-4 prose-ul:my-1.5 prose-ul:pl-4 prose-li:my-0.5 prose-strong:text-foreground/80 mt-2 text-sm leading-relaxed text-muted-foreground">
            {question.answer}
          </Markdown>
        </div>
        <a
          href={`#${anchor}`}
          title="Link to this question"
          onClick={(event) => event.stopPropagation()}
          className="mt-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <LinkIcon className="size-3.5" />
        </a>
        <ChevronDown
          className={cn(
            'mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform',
            open && 'rotate-180',
          )}
        />
      </header>
      {open && (
        <div className="flex flex-col gap-3 px-5 py-4">
          <CodeSnippet code={question.snippet} />
          {report !== undefined && <QuestionProof report={report} />}
        </div>
      )}
    </section>
  );
}

function SourceDialog({
  source,
  onClose,
}: {
  readonly source: StoryLeaf['source'];
  readonly onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[85vh] w-[min(92vw,64rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[64rem]">
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-3 pr-14">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
            {source.path}
          </DialogTitle>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto', scrollbarStyles)}>
          <SourceViewer
            filePath={source.path}
            content={source.content}
            autoHeight
            showHeader={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path;
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
      <DialogContent className="flex h-[85vh] w-[min(92vw,64rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[64rem]">
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
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-5 py-4',
            scrollbarStyles,
          )}
        >
          <StoryBody
            story={story}
            reports={reports}
            anchorPrefix={`${storyAnchor(story)}--dialog`}
          />
          <QuestionsEndSpacer />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionsEndSpacer() {
  return (
    <div
      aria-hidden="true"
      data-slot="questions-end-spacer"
      className="h-[400px] shrink-0"
    />
  );
}

// A node's id is the titles on the path to it, so the trail is already in hand.
function Breadcrumbs({
  id,
  onSelect,
}: {
  readonly id: string;
  readonly onSelect: (id: string) => void;
}) {
  const titles = id.split('/');
  if (titles.length < 2) return null;
  return (
    <nav className="flex flex-wrap items-center gap-0.5 text-xs text-muted-foreground">
      {titles.slice(0, -1).map((title, index) => (
        <span key={title} className="flex items-center gap-0.5">
          {index > 0 && (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
          )}
          <button
            type="button"
            onClick={() => onSelect(titles.slice(0, index + 1).join('/'))}
            className="rounded px-1 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
          >
            {title}
          </button>
        </span>
      ))}
    </nav>
  );
}

function PageHeading({
  title,
  description,
  verdict,
  actions,
}: {
  readonly title: string;
  readonly description?: string;
  readonly verdict?: Verdict;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        {verdict !== undefined && <VerdictDot verdict={verdict} />}
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {actions}
      </div>
      {description !== undefined && description !== '' && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </header>
  );
}

function ChildRow({
  title,
  description,
  verdict,
  count,
  onOpen,
  onOpenPage,
}: {
  readonly title: string;
  readonly description?: string;
  readonly verdict?: Verdict;
  readonly count?: number;
  readonly onOpen: () => void;
  readonly onOpenPage?: () => void;
}) {
  return (
    <div className="group flex items-center border-b border-border/60 transition-colors last:border-b-0 hover:bg-accent/40">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-baseline gap-2.5 px-3.5 py-2.5 text-left"
      >
        <span className="shrink-0 self-center">
          <VerdictDot verdict={verdict} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium leading-snug">
            {title}
          </span>
          {description !== undefined && description !== '' && (
            <span className="truncate text-xs leading-snug text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        {count !== undefined && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
            {count} question{count === 1 ? '' : 's'}
          </span>
        )}
      </button>
      {onOpenPage !== undefined && (
        <button
          type="button"
          onClick={onOpenPage}
          title="Open its own page"
          className="mr-2 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          <SquareArrowOutUpRight className="size-3" />
          page
        </button>
      )}
    </div>
  );
}
