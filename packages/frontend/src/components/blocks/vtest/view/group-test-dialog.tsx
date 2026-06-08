import type { ReactNode } from 'react';
import { useState } from 'react';
import { AlertTriangleIcon, CodeIcon, FileIcon } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';

import { CodeBlock } from '../code-block';
import { StatusBadge } from '../test-group/status-badge';
import type { VtestFile, VtestGroup, VtestTest } from '../types';
import { StatusDot } from './status-dot';

interface GroupTestDialogProps {
  /** The group whose tests and source files are shown. */
  group: VtestGroup;
  /** Name of the test selected when the dialog opens. */
  activeTest: string | null;
  /** Whether the dialog is open. */
  open: boolean;
  /** Open/close handler. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Two-pane, group-scoped test dialog. The left rail is a real nav listing the
 * group's tests with status dots and vdoc subtitles; the right pane shows the
 * selected test's header (name, status, duration, error) followed by ONLY that
 * test's source by default, with a toggle to expand to the full file. Purely
 * presentational — no run actions.
 */
export function GroupTestDialog({
  group,
  activeTest,
  open,
  onOpenChange,
}: GroupTestDialogProps) {
  const [selected, setSelected] = useState<string | null>(activeTest);
  const test =
    group.tests.find((t) => t.name === selected) ?? group.tests[0] ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(activeTest);
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[88dvh] max-h-[88dvh] w-[min(96vw,72rem)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
          <DialogTitle className="font-mono text-sm">{group.id}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <nav className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/20">
            <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span>Tests</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.6875rem] text-foreground">
                {group.tests.length}
              </span>
            </div>
            <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              {group.tests.map((t) => {
                const isActive = test?.name === t.name;
                return (
                  <button
                    type="button"
                    key={t.name}
                    onClick={() => setSelected(t.name)}
                    className={`relative flex w-full items-start gap-2.5 rounded-md py-2 pr-2.5 pl-3 text-left transition-colors ${
                      isActive
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/60'
                    }`}
                  >
                    {isActive && (
                      <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary" />
                    )}
                    <span className="mt-0.5 shrink-0">
                      <StatusDot status={t.status} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[0.8125rem] leading-snug ${
                          isActive
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {t.name}
                      </span>
                      {t.vdoc && (
                        <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground/70">
                          {t.vdoc}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              {group.tests.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  No documented tests.
                </p>
              )}
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {test ? (
              <TestDetail test={test} group={group} />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                Select a test to inspect.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TestDetail({ test, group }: { test: VtestTest; group: VtestGroup }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-2.5 border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base leading-snug font-semibold text-foreground">
            {test.name}
          </h3>
          <StatusBadge status={test.status} />
        </div>
        {test.vdoc && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {test.vdoc}
          </p>
        )}
        <dl className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
          <Meta label="File">
            <span className="font-mono text-foreground" title={test.file}>
              {basename(test.file)}
            </span>
          </Meta>
          <Meta label="Lines">
            <span className="font-mono text-foreground tabular-nums">
              {test.startLine}–{test.endLine}
            </span>
          </Meta>
          {typeof test.durationMs === 'number' && (
            <Meta label="Duration">
              <span className="font-mono text-foreground tabular-nums">
                {test.durationMs.toFixed(2)}ms
              </span>
            </Meta>
          )}
        </dl>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {test.error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <pre className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-xs text-foreground">
              {test.error}
            </pre>
          </div>
        )}
        <TestSource test={test} group={group} />
      </div>
    </div>
  );
}

/** A label/value pair in the test's metadata strip. */
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Last path segment, for a compact filename label. */
function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Renders the selected test's source. By default it slices the backing file to
 * just the test's lines (with a couple lines of context); a toggle in the code
 * header expands to the whole file. Falls back to full-file tabs when the test's
 * file/range can't be resolved.
 */
function TestSource({ test, group }: { test: VtestTest; group: VtestGroup }) {
  const [showFull, setShowFull] = useState(false);

  const file =
    group.files.find((f) => f.path === test.file) ?? group.files[0] ?? null;

  const resolvable =
    file != null && test.startLine > 0 && test.endLine >= test.startLine;

  if (!resolvable) {
    return group.files.length > 0 ? <FileTabs files={group.files} /> : null;
  }

  const lines = file.source.split('\n');
  const context = 2;
  const contextStart = Math.max(1, test.startLine - context);
  const contextEnd = Math.min(lines.length, test.endLine + context);

  const highlight: number[] = [];
  for (let n = test.startLine; n <= test.endLine; n += 1) highlight.push(n);

  const shownStart = showFull ? 1 : contextStart;
  const shownCode = showFull
    ? file.source
    : lines.slice(contextStart - 1, contextEnd).join('\n');

  const toggle = (
    <button
      type="button"
      onClick={() => setShowFull((v) => !v)}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
    >
      <CodeIcon className="size-3.5" />
      {showFull ? 'Test only' : 'Full file'}
    </button>
  );

  return (
    <CodeBlock
      code={shownCode}
      startLineNumber={shownStart}
      highlightLines={highlight}
      filename={file.path}
      actions={toggle}
    />
  );
}

function FileTabs({ files }: { files: readonly VtestFile[] }) {
  const [active, setActive] = useState(0);
  const file = files[active] ?? files[0];

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {files.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border bg-muted/40 p-1.5">
          {files.map((f, i) => (
            <button
              type="button"
              key={f.path}
              onClick={() => setActive(i)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs transition-colors ${
                i === active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileIcon className="size-3" />
              {f.path}
            </button>
          ))}
        </div>
      )}
      <CodeBlock code={file.source} className="rounded-none border-0" />
    </div>
  );
}
