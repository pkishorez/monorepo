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
 * Single-test, group-scoped modal. Shows only the clicked test: its header
 * (name, status, duration, error) followed by ONLY that test's source by
 * default, with a toggle to expand to the full file. Purely presentational —
 * no run actions.
 */
export function GroupTestDialog({
  group,
  activeTest,
  open,
  onOpenChange,
}: GroupTestDialogProps) {
  const test =
    group.tests.find((t) => t.name === activeTest) ?? group.tests[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] w-[min(96vw,56rem)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border px-7 py-4">
          <DialogTitle className="font-mono text-sm text-muted-foreground">
            {group.id}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {test ? (
            <TestDetail test={test} group={group} />
          ) : (
            <p className="p-7 text-base text-muted-foreground">
              No test to inspect.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TestDetail({ test, group }: { test: VtestTest; group: VtestGroup }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 space-y-3.5 border-b border-border px-7 py-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl leading-snug font-semibold text-foreground">
            {test.name}
          </h3>
          <StatusBadge status={test.status} />
        </div>
        {test.vdoc && (
          <p className="text-base leading-relaxed text-muted-foreground">
            {test.vdoc}
          </p>
        )}
        <dl className="flex flex-wrap gap-x-6 gap-y-1.5 pt-1 text-sm">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-7">
        {test.error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <pre className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-sm text-foreground">
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
