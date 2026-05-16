import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { ChevronDownIcon, MenuIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useMemo, useState } from 'react';

import type {
  FileNode,
  FolderDoc,
  ReportSummary,
  VTestReport,
} from '@monorepo/vtest/types';

import { Accordion } from '#components/ui/accordion';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '#components/ui/sheet';
import { cn } from '#lib/utils';

import { Markdown } from './markdown';
import { TestTree } from './test-tree';
import { deriveTitle, formatDuration, stripLeadingH1 } from './utils';

type FileLeaf = {
  kind: 'leaf';
  index: number;
  file: FileNode;
  title: string;
};
type FolderNode = {
  kind: 'folder';
  name: string;
  path: string;
  doc?: string;
  children: TreeChild[];
};
type TreeChild = FolderNode | FileLeaf;

const buildTree = (
  files: FileNode[],
  titles: string[],
  folderDocs: FolderDoc[] | undefined,
): TreeChild[] => {
  const root: TreeChild[] = [];
  const folderByPath = new Map<string, FolderNode>();

  const ensureFolder = (
    parent: TreeChild[],
    parentPath: string,
    name: string,
  ): FolderNode => {
    const existing = parent.find(
      (c): c is FolderNode => c.kind === 'folder' && c.name === name,
    );
    if (existing) return existing;
    const folder: FolderNode = {
      kind: 'folder',
      name,
      path: parentPath ? `${parentPath}/${name}` : name,
      children: [],
    };
    parent.push(folder);
    folderByPath.set(folder.path, folder);
    return folder;
  };

  files.forEach((file, i) => {
    const segments = file.filepath.split('/').filter(Boolean);
    if (segments.length === 0) {
      root.push({
        kind: 'leaf',
        index: i,
        file,
        title: titles[i] ?? file.name,
      });
      return;
    }
    segments.pop(); // drop filename
    let cursor = root;
    let path = '';
    for (const seg of segments) {
      const folder = ensureFolder(cursor, path, seg);
      cursor = folder.children;
      path = folder.path;
    }
    cursor.push({
      kind: 'leaf',
      index: i,
      file,
      title: titles[i] ?? file.name,
    });
  });

  const sortChildren = (nodes: TreeChild[]): void => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      const an = a.kind === 'folder' ? a.name : a.title;
      const bn = b.kind === 'folder' ? b.name : b.title;
      return an.localeCompare(bn);
    });
    for (const n of nodes) {
      if (n.kind === 'folder') sortChildren(n.children);
    }
  };
  // Attach folder docs by path. If a doc references a path that has no
  // auto-created folder yet, create it so it's still navigable.
  for (const fd of folderDocs ?? []) {
    let folder = folderByPath.get(fd.path);
    if (!folder) {
      const segments = fd.path.split('/').filter(Boolean);
      let cursor = root;
      let path = '';
      for (const seg of segments) {
        folder = ensureFolder(cursor, path, seg);
        cursor = folder.children;
        path = folder.path;
      }
    }
    if (folder) {
      folder.doc = fd.doc;
      if (fd.name) folder.name = fd.name;
    }
  }

  sortChildren(root);

  // strip a single shared root folder so the tree doesn't waste a level —
  // unless that folder has its own doc (then it's a real selectable page).
  if (root.length === 1 && root[0]!.kind === 'folder' && !root[0]!.doc) {
    return root[0]!.children;
  }
  return root;
};

const findFolder = (
  nodes: TreeChild[],
  path: string,
): FolderNode | undefined => {
  for (const n of nodes) {
    if (n.kind !== 'folder') continue;
    if (n.path === path) return n;
    const inner = findFolder(n.children, path);
    if (inner) return inner;
  }
  return undefined;
};

const collectFolderPaths = (nodes: TreeChild[]): string[] => {
  const out: string[] = [];
  const walk = (n: TreeChild): void => {
    if (n.kind === 'folder') {
      out.push(n.path);
      n.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return out;
};

const folderStats = (node: FolderNode): { total: number; failed: number } => {
  let total = 0;
  let failed = 0;
  const walk = (n: TreeChild): void => {
    if (n.kind === 'leaf') {
      const c = countTests(n.file);
      total += c.total;
      failed += c.failed;
    } else {
      n.children.forEach(walk);
    }
  };
  node.children.forEach(walk);
  return { total, failed };
};

type Page =
  | { kind: 'home' }
  | { kind: 'file'; index: number }
  | { kind: 'folder'; path: string };

const countTests = (file: FileNode): { total: number; failed: number } => {
  let total = 0;
  let failed = 0;
  const walk = (n: FileNode | FileNode['children'][number]): void => {
    if (n.kind === 'test') {
      total += 1;
      if (n.status === 'fail') failed += 1;
      return;
    }
    for (const c of n.children) walk(c);
  };
  walk(file);
  return { total, failed };
};

// Right-aligned, fixed-width count slot — keeps numbers in a vertical line
// across folders and files regardless of label length.
function CountSlot({ total, failed }: { total: number; failed: number }) {
  return (
    <div className="flex w-12 shrink-0 items-center justify-end">
      {total === 0 ? null : failed > 0 ? (
        <Badge
          variant="destructive"
          className="h-[18px] rounded-md px-1.5 font-mono text-[10px] leading-none font-semibold tabular-nums"
        >
          {failed}/{total}
        </Badge>
      ) : (
        <span className="text-muted-foreground/55 font-mono text-[10px] tabular-nums">
          {total}
        </span>
      )}
    </div>
  );
}

function ActiveBar({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden
      className="bg-primary pointer-events-none absolute top-1 bottom-1 left-0 w-0.5 rounded-r"
    />
  );
}

function LeafRow({
  leaf,
  active,
  onSelect,
}: {
  leaf: FileLeaf;
  active: boolean;
  onSelect: () => void;
}) {
  const { total, failed } = countTests(leaf.file);
  return (
    <div className="relative">
      <ActiveBar show={active} />
      <button
        type="button"
        onClick={onSelect}
        title={leaf.file.filepath}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md py-1 pr-1.5 pl-1.5 text-left text-sm transition-colors',
          active
            ? 'bg-muted text-foreground font-medium'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
      >
        {/* spacer to align with folder chevron */}
        <span aria-hidden className="w-4 shrink-0" />
        <span className="flex-1 truncate">{leaf.title}</span>
        <CountSlot total={total} failed={failed} />
      </button>
    </div>
  );
}

function FolderRow({
  folder,
  active,
  onSelect,
}: {
  folder: FolderNode;
  active: boolean;
  onSelect: () => void;
}) {
  const { total, failed } = folderStats(folder);
  return (
    <div className="relative flex items-stretch">
      <ActiveBar show={active} />
      {/* Chevron is the accordion trigger — clicks here only toggle. */}
      <AccordionPrimitive.Trigger
        aria-label={`Toggle ${folder.name}`}
        className="text-muted-foreground hover:text-foreground hover:bg-muted/40 group/chev flex w-5 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronDownIcon className="size-3 transition-transform duration-150 group-aria-expanded/chev:rotate-180" />
      </AccordionPrimitive.Trigger>
      {/* Name button selects/navigates — separate hit target from the chevron. */}
      <button
        type="button"
        onClick={onSelect}
        title={folder.path}
        className={cn(
          'flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors',
          active
            ? 'bg-muted text-foreground font-medium'
            : folder.doc
              ? 'text-foreground hover:bg-muted/60'
              : 'text-foreground/90 hover:bg-muted/60',
        )}
      >
        <span className="flex-1 truncate">{folder.name}</span>
        <CountSlot total={total} failed={failed} />
      </button>
    </div>
  );
}

function TreeNodes({
  nodes,
  active,
  onSelect,
}: {
  nodes: TreeChild[];
  active: Page;
  onSelect: (p: Page) => void;
}) {
  const folderPaths = useMemo(() => collectFolderPaths(nodes), [nodes]);

  return (
    <Accordion multiple defaultValue={folderPaths} className="gap-0.5">
      {nodes.map((node) => {
        if (node.kind === 'leaf') {
          return (
            <LeafRow
              key={`leaf-${node.index}`}
              leaf={node}
              active={active.kind === 'file' && active.index === node.index}
              onSelect={() => onSelect({ kind: 'file', index: node.index })}
            />
          );
        }
        return (
          <AccordionPrimitive.Item
            key={`folder-${node.path}`}
            value={node.path}
            className="border-b-0"
          >
            <AccordionPrimitive.Header>
              <FolderRow
                folder={node}
                active={active.kind === 'folder' && active.path === node.path}
                onSelect={() => onSelect({ kind: 'folder', path: node.path })}
              />
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Panel className="data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden">
              <div className="data-ending-style:h-0 data-starting-style:h-0 h-(--accordion-panel-height)">
                <div className="border-border/50 mt-0.5 ml-[14px] border-l pl-1.5">
                  <TreeNodes
                    nodes={node.children}
                    active={active}
                    onSelect={onSelect}
                  />
                </div>
              </div>
            </AccordionPrimitive.Panel>
          </AccordionPrimitive.Item>
        );
      })}
    </Accordion>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  );
}

function SidebarBody({
  report,
  tree,
  active,
  onSelect,
}: {
  report: VTestReport;
  tree: TreeChild[];
  active: Page;
  onSelect: (p: Page) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="bg-card/40 border-b px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate font-mono text-sm font-semibold tracking-tight">
              {report.package.name}
            </div>
            <div className="text-muted-foreground mt-0.5 font-mono text-[11px]">
              v{report.package.version}
            </div>
          </div>
          <ThemeToggle />
        </div>
        <div className="mt-3">
          <SummaryHeader summary={report.summary} />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {report.home !== undefined && (
          <button
            type="button"
            onClick={() => onSelect({ kind: 'home' })}
            className={cn(
              'relative mb-2 flex w-full items-center rounded-md px-2 py-1 text-left text-sm transition-colors',
              active.kind === 'home'
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            {active.kind === 'home' && (
              <span
                aria-hidden
                className="bg-primary absolute top-1 bottom-1 left-0 w-0.5 rounded-r"
              />
            )}
            <span className="flex-1 truncate">Overview</span>
          </button>
        )}

        {report.files.length > 0 && (
          <div className="text-muted-foreground mt-3 mb-1 px-2 text-[10px] font-semibold tracking-wider uppercase">
            Modules
          </div>
        )}

        <TreeNodes nodes={tree} active={active} onSelect={onSelect} />
      </nav>
    </div>
  );
}

function DesktopSidebar({
  report,
  tree,
  active,
  onSelect,
}: {
  report: VTestReport;
  tree: TreeChild[];
  active: Page;
  onSelect: (p: Page) => void;
}) {
  return (
    <aside className="bg-card/30 sticky top-0 hidden h-[100dvh] w-72 shrink-0 border-r md:block">
      <SidebarBody
        report={report}
        tree={tree}
        active={active}
        onSelect={onSelect}
      />
    </aside>
  );
}

function MobileSidebar({
  report,
  tree,
  active,
  onSelect,
}: {
  report: VTestReport;
  tree: TreeChild[];
  active: Page;
  onSelect: (p: Page) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card/40 sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open navigation"
            />
          }
        >
          <MenuIcon className="size-4" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
          <SidebarBody
            report={report}
            tree={tree}
            active={active}
            onSelect={(p) => {
              onSelect(p);
              setOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1">
        <div className="text-foreground truncate font-mono text-sm font-semibold tracking-tight">
          {report.package.name}
        </div>
      </div>
      <ThemeToggle />
    </div>
  );
}

function SummaryHeader({ summary }: { summary: ReportSummary }) {
  const { passed, failed, skipped, total, durationMs } = summary;
  const passPct = total > 0 ? (passed / total) * 100 : 100;
  const failPct = total > 0 ? (failed / total) * 100 : 0;
  const skipPct = total > 0 ? (skipped / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-foreground text-sm font-semibold tabular-nums">
          {passed}
          <span className="text-muted-foreground/70 font-mono text-xs font-normal">
            /{total}
          </span>
          <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">
            passing
          </span>
        </div>
        <span className="text-muted-foreground font-mono text-[10px]">
          {formatDuration(durationMs)}
        </span>
      </div>
      <div className="bg-muted flex h-1.5 overflow-hidden rounded-full">
        {passPct > 0 && (
          <div className="bg-emerald-500" style={{ width: `${passPct}%` }} />
        )}
        {failPct > 0 && (
          <div className="bg-red-500" style={{ width: `${failPct}%` }} />
        )}
        {skipPct > 0 && (
          <div className="bg-amber-500" style={{ width: `${skipPct}%` }} />
        )}
      </div>
      <div className="text-muted-foreground flex items-center gap-3 text-[11px] tabular-nums">
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {passed} pass
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1',
            failed > 0 && 'text-red-500',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              failed > 0 ? 'bg-red-500' : 'bg-muted-foreground/30',
            )}
          />
          {failed} fail
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1',
            skipped > 0 && 'text-amber-500',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              skipped > 0 ? 'bg-amber-500' : 'bg-muted-foreground/30',
            )}
          />
          {skipped} skip
        </span>
      </div>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-8 flex flex-col gap-2 border-b pb-6">
      {eyebrow && (
        <div className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
          {eyebrow}
        </div>
      )}
      <h1 className="text-foreground text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      {subtitle && (
        <code className="text-muted-foreground text-xs">{subtitle}</code>
      )}
    </header>
  );
}

function HomePage({ report }: { report: VTestReport }) {
  return (
    <article>
      <PageHeader
        eyebrow="Package"
        title={report.package.name}
        subtitle={
          report.package.description ? undefined : `v${report.package.version}`
        }
      />
      {report.package.description && (
        <p className="text-muted-foreground -mt-4 mb-8 text-base leading-relaxed">
          {report.package.description}
        </p>
      )}
      {report.home && <Markdown source={stripLeadingH1(report.home)} />}
    </article>
  );
}

function FilePage({
  file,
  title,
  prev,
  next,
  onNavigate,
}: {
  file: FileNode;
  title: string;
  prev?: { title: string; index: number };
  next?: { title: string; index: number };
  onNavigate: (p: Page) => void;
}) {
  const { total, failed } = countTests(file);
  return (
    <article>
      <PageHeader eyebrow="Module" title={title} subtitle={file.filepath} />
      {file.doc && (
        <div className="mb-12">
          <Markdown source={stripLeadingH1(file.doc)} />
        </div>
      )}
      {file.children.length > 0 && (
        <section>
          <div className="mb-5 flex items-baseline justify-between border-b pb-3">
            <h2 className="text-foreground text-sm font-semibold tracking-wider uppercase">
              Tests
            </h2>
            <div className="text-muted-foreground font-mono text-xs">
              {total} test{total === 1 ? '' : 's'}
              {failed > 0 && (
                <span className="ml-2 text-red-500">· {failed} failing</span>
              )}
            </div>
          </div>
          <TestTree children={file.children} filepath={file.filepath} />
        </section>
      )}
      {(prev || next) && (
        <nav className="mt-16 grid grid-cols-2 gap-3 border-t pt-6">
          <div>
            {prev && (
              <button
                type="button"
                onClick={() => onNavigate({ kind: 'file', index: prev.index })}
                className="hover:bg-muted/50 group block w-full rounded-md border px-4 py-3 text-left transition-colors"
              >
                <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                  ← Previous
                </div>
                <div className="text-foreground group-hover:text-primary mt-0.5 truncate text-sm font-medium">
                  {prev.title}
                </div>
              </button>
            )}
          </div>
          <div>
            {next && (
              <button
                type="button"
                onClick={() => onNavigate({ kind: 'file', index: next.index })}
                className="hover:bg-muted/50 group block w-full rounded-md border px-4 py-3 text-right transition-colors"
              >
                <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                  Next →
                </div>
                <div className="text-foreground group-hover:text-primary mt-0.5 truncate text-sm font-medium">
                  {next.title}
                </div>
              </button>
            )}
          </div>
        </nav>
      )}
    </article>
  );
}

function FolderPage({
  folder,
  onSelect,
}: {
  folder: FolderNode;
  onSelect: (p: Page) => void;
}) {
  return (
    <article>
      <PageHeader
        eyebrow="Section"
        title={folder.name}
        subtitle={folder.path}
      />
      {folder.doc && (
        <div className="mb-12">
          <Markdown source={stripLeadingH1(folder.doc)} />
        </div>
      )}
      {folder.children.length > 0 && (
        <section>
          <div className="mb-5 flex items-baseline justify-between border-b pb-3">
            <h2 className="text-foreground text-sm font-semibold tracking-wider uppercase">
              In this section
            </h2>
            <div className="text-muted-foreground font-mono text-xs tabular-nums">
              {folder.children.length}{' '}
              {folder.children.length === 1 ? 'item' : 'items'}
            </div>
          </div>
          <ul className="divide-border/60 divide-y border-y border-border/60">
            {folder.children.map((child) => {
              const isFolder = child.kind === 'folder';
              const stats = isFolder
                ? folderStats(child)
                : countTests(child.file);
              return (
                <li key={isFolder ? `f-${child.path}` : `l-${child.index}`}>
                  <button
                    type="button"
                    onClick={() =>
                      isFolder
                        ? onSelect({ kind: 'folder', path: child.path })
                        : onSelect({ kind: 'file', index: child.index })
                    }
                    className="hover:bg-muted/40 group flex w-full items-baseline gap-4 px-2 py-3 text-left transition-colors"
                  >
                    <span className="text-muted-foreground/70 w-14 shrink-0 font-mono text-[10px] font-semibold tracking-wider uppercase">
                      {isFolder ? 'Folder' : 'Module'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-foreground group-hover:text-primary truncate text-sm font-medium">
                        {isFolder ? child.name : child.title}
                      </div>
                      <div className="text-muted-foreground/70 mt-0.5 truncate font-mono text-[11px]">
                        {isFolder
                          ? `${child.children.length} item${child.children.length === 1 ? '' : 's'}`
                          : child.file.filepath}
                      </div>
                    </div>
                    <div className="text-muted-foreground shrink-0 font-mono text-[11px] tabular-nums">
                      {stats.failed > 0 ? (
                        <Badge
                          variant="destructive"
                          className="h-5 rounded-md px-1.5 font-mono text-[10px] font-semibold tabular-nums"
                        >
                          {stats.failed} failing
                        </Badge>
                      ) : (
                        <span>{stats.total} tests</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}

export function VTestDocs({ report }: { report: VTestReport }) {
  const [page, setPage] = useState<Page>(() =>
    report.home !== undefined
      ? { kind: 'home' }
      : report.files.length > 0
        ? { kind: 'file', index: 0 }
        : { kind: 'home' },
  );
  const fileTitles = useMemo(
    () => report.files.map(deriveTitle),
    [report.files],
  );
  const tree = useMemo(
    () => buildTree(report.files, fileTitles, report.folders),
    [report.files, fileTitles, report.folders],
  );

  const renderMain = () => {
    if (page.kind === 'home') return <HomePage report={report} />;
    if (page.kind === 'folder') {
      const folder = findFolder(tree, page.path);
      if (!folder) return null;
      return <FolderPage folder={folder} onSelect={setPage} />;
    }
    const file = report.files[page.index];
    if (!file) return null;
    return (
      <FilePage
        file={file}
        title={fileTitles[page.index] ?? file.name}
        prev={
          page.index > 0
            ? {
                title:
                  fileTitles[page.index - 1] ??
                  report.files[page.index - 1]!.name,
                index: page.index - 1,
              }
            : undefined
        }
        next={
          page.index < report.files.length - 1
            ? {
                title:
                  fileTitles[page.index + 1] ??
                  report.files[page.index + 1]!.name,
                index: page.index + 1,
              }
            : undefined
        }
        onNavigate={setPage}
      />
    );
  };

  return (
    <div className="bg-background text-foreground flex min-h-[100dvh]">
      <DesktopSidebar
        report={report}
        tree={tree}
        active={page}
        onSelect={setPage}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileSidebar
          report={report}
          tree={tree}
          active={page}
          onSelect={setPage}
        />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-3xl px-6 py-8 md:px-10 md:py-12">
            {renderMain()}
          </div>
        </main>
      </div>
    </div>
  );
}
