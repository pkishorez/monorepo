import { ChevronDownIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Highlight, themes } from 'prism-react-renderer';

import type { SuiteNode, TestNode, TestStatus } from '@monorepo/vtest/types';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#components/ui/dialog';
import { cn } from '#lib/utils';

import { Markdown } from './markdown';
import { formatDuration } from './utils';

type Glyph = { glyph: string; tone: string; label: string };

// Minimal status visuals. Failures are the only state that earns colour —
// passing/skipped/todo all stay in muted-foreground territory so a long
// test list reads as a quiet list, not a runway.
const statusGlyph: Record<TestStatus, Glyph> = {
  pass: { glyph: '✓', tone: 'text-muted-foreground/70', label: 'passed' },
  fail: { glyph: '✕', tone: 'text-red-500', label: 'failed' },
  skip: { glyph: '⊘', tone: 'text-muted-foreground/50', label: 'skipped' },
  todo: { glyph: '○', tone: 'text-muted-foreground/50', label: 'todo' },
  running: {
    glyph: '◌',
    tone: 'text-muted-foreground/70',
    label: 'running',
  },
};

const languageFromPath = (path: string | undefined): string => {
  if (!path) return 'tsx';
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts'))
    return 'typescript';
  if (path.endsWith('.jsx')) return 'jsx';
  return 'javascript';
};

type Counts = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
};

const collectTests = (node: SuiteNode | TestNode): TestNode[] => {
  if (node.kind === 'test') return [node];
  return node.children.flatMap(collectTests);
};

const tally = (tests: TestNode[]): Counts => {
  const c: Counts = {
    total: tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
  };
  for (const t of tests) {
    if (t.status === 'pass') c.passed += 1;
    else if (t.status === 'fail') c.failed += 1;
    else if (t.status === 'skip') c.skipped += 1;
    else if (t.status === 'todo') c.todo += 1;
  }
  return c;
};

// First plain-prose line of a markdown blob. Used for the suite row teaser.
const summaryLine = (md: string | undefined): string => {
  if (!md) return '';
  const line = md
    .split('\n')
    .map((l) => l.trim())
    .find(
      (l) =>
        l.length > 0 &&
        !l.startsWith('#') &&
        !l.startsWith('```') &&
        !l.startsWith('|') &&
        !l.startsWith('---') &&
        !l.startsWith('>'),
    );
  if (!line) return '';
  return line.replace(/[*_`]/g, '');
};

function CodeBlock({
  code,
  language,
  startLine,
}: {
  code: string;
  language: string;
  startLine: number;
}) {
  const { resolvedTheme } = useTheme();
  const prismTheme = resolvedTheme === 'light' ? themes.vsLight : themes.vsDark;
  return (
    <div className="bg-card overflow-hidden rounded-md border">
      <Highlight code={code} language={language} theme={prismTheme}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} overflow-x-auto py-3 font-mono text-[12px] leading-relaxed`}
            style={style}
          >
            {tokens.map((line, i) => {
              const { key: _k, ...lineProps } = getLineProps({ line });
              return (
                <div
                  key={i}
                  {...lineProps}
                  className={`${lineProps.className ?? ''} flex`}
                >
                  <span className="text-muted-foreground/40 mr-3 inline-block w-10 shrink-0 pl-3 text-right font-mono text-[10px] tabular-nums select-none">
                    {startLine + i}
                  </span>
                  <span className="min-w-0 flex-1 pr-3">
                    {line.map((token, j) => {
                      const { key: _tk, ...tokenProps } = getTokenProps({
                        token,
                      });
                      return <span key={j} {...tokenProps} />;
                    })}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function ErrorDetails({ error }: { error: NonNullable<TestNode['error']> }) {
  return (
    <div className="overflow-hidden rounded-md border border-red-500/30 bg-red-500/[0.04]">
      <div className="border-b border-red-500/20 bg-red-500/[0.06] px-3 py-2 font-mono text-xs font-semibold text-red-500 dark:text-red-400">
        {error.message}
      </div>
      {(error.expected !== undefined || error.actual !== undefined) && (
        <div className="grid gap-1.5 p-3 font-mono text-xs">
          {error.expected !== undefined && (
            <div className="flex gap-2">
              <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400">
                expected
              </span>
              <span className="text-muted-foreground whitespace-pre-wrap">
                {error.expected}
              </span>
            </div>
          )}
          {error.actual !== undefined && (
            <div className="flex gap-2">
              <span className="shrink-0 font-semibold text-red-500 dark:text-red-400">
                actual
              </span>
              <span className="text-muted-foreground whitespace-pre-wrap">
                {error.actual}
              </span>
            </div>
          )}
        </div>
      )}
      {error.stack && (
        <details className="border-t border-red-500/20 px-3 py-2">
          <summary className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1 font-mono text-[11px]">
            stack trace
          </summary>
          <pre className="text-muted-foreground/80 mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre">
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  );
}

function CountsLine({
  counts,
  className,
}: {
  counts: Counts;
  className?: string;
}) {
  const parts: string[] = [
    `${counts.total} test${counts.total === 1 ? '' : 's'}`,
  ];
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`);
  if (counts.todo > 0) parts.push(`${counts.todo} todo`);
  return (
    <span
      className={cn(
        'text-muted-foreground/70 font-mono text-[11px] tabular-nums',
        className,
      )}
    >
      {parts.join(' · ')}
      {counts.failed > 0 && (
        <span className="ml-2 text-red-500">· {counts.failed} failing</span>
      )}
    </span>
  );
}

function TestEntry({ node, filepath }: { node: TestNode; filepath?: string }) {
  const v = statusGlyph[node.status];
  const language = languageFromPath(filepath);
  return (
    <li className="border-border/40 border-b py-4 last:border-b-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span
          aria-label={v.label}
          title={v.label}
          className={cn('w-3 shrink-0 font-mono text-xs leading-none', v.tone)}
        >
          {v.glyph}
        </span>
        <span className="text-foreground flex-1 text-sm leading-snug font-medium">
          {node.name}
        </span>
        {node.duration !== undefined && (
          <span className="text-muted-foreground/70 shrink-0 font-mono text-[11px] tabular-nums">
            {formatDuration(node.duration)}
          </span>
        )}
      </div>
      {node.doc && (
        <div className="mt-2 ml-6">
          <Markdown source={node.doc} size="sm" />
        </div>
      )}
      {node.snippet && (
        <div className="mt-3 ml-6">
          <CodeBlock
            code={node.snippet}
            language={language}
            startLine={node.snippetStartLine ?? node.location?.line ?? 1}
          />
        </div>
      )}
      {node.error && (
        <div className="mt-3 ml-6">
          <ErrorDetails error={node.error} />
        </div>
      )}
    </li>
  );
}

function SuiteDialog({
  node,
  tests,
  counts,
  filepath,
}: {
  node: SuiteNode;
  tests: TestNode[];
  counts: Counts;
  filepath?: string;
}) {
  return (
    <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-3xl">
      <DialogHeader className="border-b px-6 py-4">
        <div className="text-muted-foreground font-mono text-[10px] font-semibold tracking-[0.14em] uppercase">
          Suite
        </div>
        <DialogTitle className="mt-1 text-xl font-semibold tracking-tight">
          {node.name}
        </DialogTitle>
        <DialogDescription render={<div className="mt-1.5" />}>
          <CountsLine counts={counts} />
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
        {node.doc && (
          <div className="border-border/60 mb-5 border-b pb-5">
            <Markdown source={node.doc} size="sm" />
          </div>
        )}
        <ul className="flex flex-col">
          {tests.map((t, i) => (
            <TestEntry key={i} node={t} filepath={filepath} />
          ))}
        </ul>
      </div>
    </DialogContent>
  );
}

function SuiteRow({ node, filepath }: { node: SuiteNode; filepath?: string }) {
  const tests = collectTests(node);
  const counts = tally(tests);
  const teaser = summaryLine(node.doc);
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group hover:bg-muted/40 hover:border-border/70 flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors"
          />
        }
      >
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground/50 group-hover:text-muted-foreground size-3.5 shrink-0 -rotate-90 transition-colors"
        />
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-sm font-medium">
            {node.name}
          </div>
          {teaser && (
            <div className="text-muted-foreground mt-0.5 truncate text-xs">
              {teaser}
            </div>
          )}
        </div>
        <CountsLine counts={counts} className="shrink-0" />
      </DialogTrigger>
      <SuiteDialog
        node={node}
        tests={tests}
        counts={counts}
        filepath={filepath}
      />
    </Dialog>
  );
}

type Group =
  | { kind: 'suite'; node: SuiteNode }
  | { kind: 'tests'; nodes: TestNode[] };

const groupChildren = (children: Array<SuiteNode | TestNode>): Group[] => {
  const groups: Group[] = [];
  for (const c of children) {
    if (c.kind === 'suite') {
      groups.push({ kind: 'suite', node: c });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.kind === 'tests') last.nodes.push(c);
    else groups.push({ kind: 'tests', nodes: [c] });
  }
  return groups;
};

export function TestTree({
  children,
  filepath,
}: {
  children: Array<SuiteNode | TestNode>;
  filepath?: string;
}) {
  const groups = groupChildren(children);
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g, i) =>
        g.kind === 'suite' ? (
          <SuiteRow key={i} node={g.node} filepath={filepath} />
        ) : (
          <ul key={i} className="border-border/60 rounded-md border px-4 py-1">
            {g.nodes.map((t, j) => (
              <TestEntry key={j} node={t} filepath={filepath} />
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
