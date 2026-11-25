import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { DiffViewer } from '@kestack/web-platform/ui/viewers/diff-viewer';
import { SourceViewer } from '@kestack/web-platform/ui/viewers/source-viewer';
import { ArrowLeftIcon, XIcon } from 'lucide-react';

import type { FileDiff } from '../../../../../../../../server/rpc/git/contract/index.js';
import type { FileViewerShape } from '../logic/shared/index.js';
import { setDiffOptions, useDiffOptions } from './diff-options.js';
import { DiffToggles } from './diff-toggles.js';

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const folderOf = (path: string) => {
  const at = path.lastIndexOf('/');
  return at === -1 ? './' : `${path.slice(0, at)}/`;
};

const countsOf = (diff: FileDiff) => {
  let added = 0;
  let removed = 0;
  for (const hunk of diff.hunks)
    for (const line of hunk.lines) {
      if (line.kind === 'added') added += 1;
      else if (line.kind === 'removed') removed += 1;
    }
  return { added, removed };
};

export function Body({
  root,
  _tag,
  model,
  state,
  send,
}: ViewPropsOf<typeof FileViewerShape>) {
  const options = useDiffOptions();
  const counts = _tag === 'Diff' ? countsOf(state.diff) : null;
  return (
    <section
      {...root}
      aria-label={`File ${model.path}`}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header
        className={cn(
          'flex h-11 shrink-0 items-center gap-3 border-b border-border/60 pr-1.5 pl-3',
          'max-sm:h-auto max-sm:min-h-14 max-sm:pt-[env(safe-area-inset-top)] max-sm:pr-1.5 max-sm:pl-1.5',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            model.besideFolderList ? 'Back to the list' : 'Close the file'
          }
          className="size-11 sm:hidden"
          onClick={() => send({ _tag: 'Closed' })}
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col" title={model.path}>
          <span className="truncate font-mono text-xs font-medium">
            {nameOf(model.path)}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {folderOf(model.path)}
            {model.status !== null && model.base !== null
              ? ` · ${model.status} since ${model.base}`
              : ''}
          </span>
        </div>
        {counts === null ? null : (
          <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="text-added">+{counts.added}</span>
            <span className="text-removed">−{counts.removed}</span>
          </span>
        )}
        {_tag === 'Diff' ? <DiffToggles /> : null}
        {model.besideFolderList ? null : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close the file"
            title="Close"
            className="max-sm:hidden"
            onClick={() => send({ _tag: 'Closed' })}
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </header>
      <div className={`min-h-0 flex-1 overflow-auto ${scrollbarStyles}`}>
        {_tag === 'Loading' ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : _tag === 'Failure' ? (
          <p className="p-4 text-sm text-destructive">{state.problem}</p>
        ) : _tag === 'Text' ? (
          state.binary ? (
            <p className="p-4 text-sm text-muted-foreground">
              A binary file: nothing to show.
            </p>
          ) : (
            <SourceViewer
              autoHeight
              filePath={model.path}
              content={state.content}
              showHeader={false}
            />
          )
        ) : (
          <DiffViewer
            autoHeight
            showToolbar={false}
            diff={state.diff}
            options={options}
            onOptionsChange={setDiffOptions}
            {...(state.content === null
              ? {}
              : { fallbackContent: state.content })}
          />
        )}
      </div>
    </section>
  );
}
