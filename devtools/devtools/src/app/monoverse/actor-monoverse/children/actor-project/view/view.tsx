import { useState, type ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';

import { Opening } from '../../../view/shared/index.js';
import {
  baseOf,
  branchOf,
  changesOf,
  changeTallies,
  isRereading,
  nameOf,
  shownChangesOf,
  statusOf,
  type Change,
  type ProjectShape,
} from '../logic/shared/index.js';
import { Breadcrumb } from './breadcrumb.js';
import { CannotOpen } from './cannot-open.js';
import { GitControls, type GitControlsProps } from './git-controls.js';
import { ViewPanel, WherePanel, type WherePanelProps } from './panels.js';
import { PanelSlotsContext, Rereading, useWide } from './shared/index.js';

const changesByPackage = (
  packages: ReadonlyArray<{ readonly path: string }>,
  changes: ReadonlyArray<Change>,
) => {
  const tallies = changeTallies(changes);
  const byPackage = new Map<
    string,
    { count: number; status: ReturnType<typeof statusOf> }
  >();
  for (const { path } of packages) {
    const tally = tallies.get(path);
    if (tally === undefined) continue;
    byPackage.set(path, {
      count: tally.added + tally.modified + tally.deleted,
      status: statusOf(tally),
    });
  }
  return byPackage;
};

type BodyProps = ViewPropsOf<typeof ProjectShape> & {
  readonly tree: ReactNode;
  readonly package: ReactNode;
  readonly viewer: ReactNode;
};

export function Body(self: BodyProps) {
  const {
    root,
    model,
    props,
    state,
    send,
    tree,
    package: shownPackage,
    viewer,
  } = self;
  const wide = useWide();
  const [selection, setSelection] = useState<HTMLDivElement | null>(null);
  const [folders, setFolders] = useState<HTMLDivElement | null>(null);

  const project = props.name ?? nameOf(model.root);
  const rereading =
    state._tag === 'Monorepo' && props.package === null && isRereading(self);
  const changes = changesOf(self);
  const shown = shownChangesOf(self);
  const packageChanges =
    state._tag !== 'Monorepo' || shown === null
      ? null
      : changesByPackage(state.workspace.packages, shown);

  const packages: WherePanelProps['packages'] =
    state._tag === 'Monorepo'
      ? {
          all: state.workspace.packages,
          current: props.package,
          changes:
            packageChanges === null
              ? null
              : { of: packageChanges, unchanged: props.unchanged },
          onChoose: (path) =>
            send(
              path === null
                ? { _tag: 'Left' }
                : { _tag: 'Entered', package: path },
            ),
        }
      : null;
  const git: GitControlsProps = {
    branches: model.branches,
    problem: model.gitProblem,
    branch: branchOf(self),
    base: baseOf(self),
    changes: props.changes,
    reading: props.changes && changes === null,
    changesProblem: model.changesProblem,
    onBranch: (branch) => send({ _tag: 'BranchChosen', branch }),
    onBase: (base) => send({ _tag: 'BaseChosen', base }),
    onChanges: () => send({ _tag: 'ChangesToggled' }),
    deleted: props.deleted,
    onDeleted: () => send({ _tag: 'DeletedToggled' }),
    unchanged: props.unchanged,
    onUnchanged: (unchanged) => send({ _tag: 'UnchangedChosen', unchanged }),
    ignored: props.ignored,
    onIgnored: () => send({ _tag: 'IgnoredToggled' }),
    connections: {
      shown: props.shown,
      outside: props.outside,
      onShown: (kind) => send({ _tag: 'ShownToggled', kind }),
      onOutside: () => send({ _tag: 'OutsideToggled' }),
    },
  };

  return (
    <div {...root} className="flex h-full min-h-0 flex-col">
      {wide ? null : (
        <header className="flex min-h-11 shrink-0 items-center gap-3 border-b border-border/60 py-1 pr-2 pl-2 max-sm:pl-1.5">
          <Breadcrumb
            project={project}
            path={model.root}
            packages={packages}
            onSwitch={() => send({ _tag: 'SwitchAsked' })}
          />
          <div className="ml-auto shrink-0">
            <GitControls {...git} />
          </div>
        </header>
      )}
      <div className="flex min-h-0 flex-1">
        <main className="relative min-h-0 min-w-0 flex-1">
          {wide ? (
            <>
              <WherePanel
                project={project}
                path={model.root}
                onSwitch={() => send({ _tag: 'SwitchAsked' })}
                packages={packages}
                selectionSlot={setSelection}
              />
              <ViewPanel {...git} foldersSlot={setFolders} />
            </>
          ) : null}
          <PanelSlotsContext.Provider
            value={{ docked: wide, selection, folders }}
          >
            {state._tag === 'Opening' ? (
              <Opening root={model.root} />
            ) : state._tag === 'Failure' ? (
              <CannotOpen
                root={model.root}
                problem={state.problem}
                missing={state.missing}
                onRetry={() => send({ _tag: 'Retried' })}
                onPickAnother={() => send({ _tag: 'SwitchAsked' })}
              />
            ) : state._tag === 'Monorepo' ? (
              <div className="h-full min-h-0">{shownPackage ?? tree}</div>
            ) : (
              shownPackage
            )}
          </PanelSlotsContext.Provider>
          {rereading ? <Rereading>Reading the branch…</Rereading> : null}
        </main>
      </div>
      <Dialog
        open={viewer !== null}
        onOpenChange={(open) => {
          if (!open) send({ _tag: 'ViewClosed' });
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[calc(100dvh-2.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(120rem,calc(100%-2.5rem))] max-sm:inset-0 max-sm:h-dvh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0"
        >
          <DialogTitle className="sr-only">
            {model.open?._tag === 'Folder' ? 'Folder' : 'File'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {model.open?._tag === 'Folder'
              ? 'The files in the folder, or what changed in it, and one of them.'
              : 'The file, or what changed in it.'}
          </DialogDescription>
          {viewer}
        </DialogContent>
      </Dialog>
    </div>
  );
}
