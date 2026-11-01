import { Children, Fragment, isValidElement, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  CheckIcon,
  CopyIcon,
  FileCodeIcon,
  FolderOpenIcon,
} from 'lucide-react';

/*
 * The code behind a demo: its files as a tree on the left, the one picked
 * on the right. Each file is a code block written inside, ```ts
 * file=./app/counter.ts, so what is shown is the file the demo runs. The
 * tree starts below the folder every file shares, and lists files in the
 * order they are written. On a phone the tree becomes a row of tabs over
 * the code. Every file is the same height, so picking one moves nothing.
 */

/** A code block that includes a file, as the MDX hands it over. */
export type FileBlock = ReactElement<{
  readonly 'data-file'?: string;
  readonly 'data-path'?: string;
}>;

/** What is written inside a Demo or Files: the code blocks naming a file, and the rest. */
export const split = (children: ReactNode) => {
  // MDX hands each code block over inside a Fragment of its own.
  const parts = Children.toArray(children).flatMap((part) =>
    isValidElement<{ readonly children?: ReactNode }>(part) &&
    part.type === Fragment
      ? Children.toArray(part.props.children)
      : [part],
  );
  const files = parts.filter(
    (part): part is FileBlock =>
      isValidElement(part) &&
      typeof (part.props as { 'data-file'?: unknown })['data-file'] ===
        'string',
  );
  const rest = parts.filter((part) => !files.includes(part as FileBlock));
  return { files, rest };
};

type Row =
  | { readonly kind: 'folder'; readonly name: string; readonly depth: number }
  | {
      readonly kind: 'file';
      readonly name: string;
      readonly depth: number;
      readonly index: number;
    };

/** The tree's rows, top to bottom: a folder once, before its first file. */
const rowsOf = (paths: ReadonlyArray<ReadonlyArray<string>>) => {
  const rows: Array<Row> = [];
  const opened = new Set<string>();
  paths.forEach((parts, index) => {
    parts.slice(0, -1).forEach((name, depth) => {
      const key = parts.slice(0, depth + 1).join('/');
      if (opened.has(key)) return;
      opened.add(key);
      rows.push({ kind: 'folder', name, depth });
    });
    rows.push({
      kind: 'file',
      name: parts.at(-1)!,
      depth: parts.length - 1,
      index,
    });
  });
  return rows;
};

/** Each file's path, below the folders they all share. */
const pathsOf = (files: ReadonlyArray<FileBlock>) => {
  const paths = files.map((file) =>
    (file.props['data-path'] ?? file.props['data-file']!).split('/'),
  );
  let shared = 0;
  while (
    paths.every(
      (parts) =>
        parts.length - 1 > shared && parts[shared] === paths[0]![shared],
    )
  )
    shared++;
  return paths.map((parts) => parts.slice(shared));
};

const tab =
  'flex h-10 shrink-0 items-center border-b-2 border-transparent px-3 font-mono text-xs text-muted-foreground hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground';

export function Files({ children }: { readonly children: ReactNode }) {
  const { files } = split(children);
  const paths = pathsOf(files);
  const rows = rowsOf(paths);
  const [shown, setShown] = useState(0);
  const code = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = code.current?.querySelector(
      '[role=tabpanel]:not([hidden]) pre',
    )?.textContent;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <figure className="my-8 overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid sm:grid-cols-[13rem_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label="Files"
          aria-orientation="vertical"
          className="hidden border-r border-border bg-muted/30 py-2 sm:block"
        >
          {rows.map((row) =>
            row.kind === 'folder' ? (
              <div
                key={`folder:${row.depth}:${row.name}`}
                className="flex h-8 items-center gap-2 pr-3 text-[13px] text-muted-foreground"
                style={{ paddingLeft: `${12 + row.depth * 14}px` }}
              >
                <FolderOpenIcon className="size-3.5 shrink-0" />
                <span className="truncate">{row.name}</span>
              </div>
            ) : (
              <button
                key={row.index}
                type="button"
                role="tab"
                aria-selected={shown === row.index}
                onClick={() => setShown(row.index)}
                className="flex h-8 w-full items-center gap-2 pr-3 text-left font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-selected:bg-muted aria-selected:font-medium aria-selected:text-foreground"
                style={{ paddingLeft: `${12 + row.depth * 14}px` }}
              >
                <FileCodeIcon className="size-3.5 shrink-0" />
                <span className="truncate">{row.name}</span>
              </button>
            ),
          )}
        </div>
        <div className="min-w-0">
          <div
            role="tablist"
            aria-label="Files"
            className="flex overflow-x-auto border-b border-border bg-muted/30 px-1 sm:hidden"
          >
            {paths.map((parts, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={shown === index}
                onClick={() => setShown(index)}
                className={tab}
              >
                {parts.at(-1)}
              </button>
            ))}
          </div>
          <div className="flex h-10 items-center gap-3 border-b border-border px-4 max-sm:hidden">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {paths[shown]?.join('/')}
            </span>
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? 'Copied' : 'Copy the file'}
              title="Copy the file"
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3.5"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <div ref={code} className="h-[26rem]">
            {files.map((file, index) => (
              <div
                key={index}
                role="tabpanel"
                hidden={shown !== index}
                className="h-full [&>pre]:m-0 [&>pre]:h-full [&>pre]:overflow-auto [&>pre]:rounded-none [&>pre]:border-0"
              >
                {file}
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
