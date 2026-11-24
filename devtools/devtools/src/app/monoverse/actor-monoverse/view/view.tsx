import { useState, type ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';

import {
  baseOf,
  branchOf,
  changesOf,
  changeTallies,
  isRereading,
  nameOf,
  rootOf,
  shownChangesOf,
  statusOf,
  type Change,
  type MonoverseShape,
} from '../logic/shared/index.js';
import { Breadcrumb } from './breadcrumb.js';
import { GitControls, type GitControlsProps } from './git-controls.js';
import { ViewPanel, WherePanel, type WherePanelProps } from './panels.js';
import {
  CannotOpen,
  Opening,
  PanelSlotsContext,
  Rereading,
  useWide,
} from './shared/index.js';

/*
 * Monoverse drawn: with no project, the picker alone in the middle of the
 * page. With one, a slim bar, where you are on the left and the three git
 * controls on the right, over the tree, as big as it can be, the open file
 * beside it; the picker opens over it from the project's crumb. On a wide
 * screen no bar: the tree sits in the middle, a panel either side holding
 * every control, so none is far from another.
 */

/** What changed in each Package: how many files, and the colour they roll up to. */
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

type BodyProps = ViewPropsOf<typeof MonoverseShape> & {
  /** The picker, while it is open: the page, or a dialog over the project. */
  readonly picker: ReactNode;
  /** The file open over the tree, while one is. */
  readonly file: ReactNode;
  /** The folder open over the tree, while one is. */
  readonly folder: ReactNode;
  /** The Monorepo's tree, in its State. */
  readonly monorepo: ReactNode;
  /** The Single Package, in its State. */
  readonly package: ReactNode;
};

export function Body({
  root,
  model,
  state,
  send,
  picker,
  file,
  folder,
  monorepo,
  package: single,
}: BodyProps) {
  const wide = useWide();
  // Where the tree draws its own controls, in the side panels.
  const [selection, setSelection] = useState<HTMLDivElement | null>(null);
  const [folders, setFolders] = useState<HTMLDivElement | null>(null);
  if (state._tag === 'Picking')
    return (
      <div
        {...root}
        className="flex h-full min-h-0 items-start justify-center overflow-y-auto px-4 pt-[12vh] pb-8"
      >
        <section
          aria-labelledby="monoverse-picker-title"
          className="flex w-full max-w-xl flex-col gap-5"
        >
          <header className="flex flex-col gap-1 px-1">
            <h1
              id="monoverse-picker-title"
              className="text-lg font-semibold tracking-tight"
            >
              Open a project
            </h1>
            <p className="text-sm text-pretty text-muted-foreground">
              A monorepo or a single package: Monoverse draws it as its folder
              tree, and shows what breaks the folder rule.
            </p>
          </header>
          {model.projectsProblem === null ? null : (
            <p role="alert" className="px-1 text-sm text-destructive">
              {model.projectsProblem}
            </p>
          )}
          <div className="overflow-hidden rounded-xl bg-popover shadow-lg ring-1 ring-border/60 dark:shadow-black/40">
            {picker}
          </div>
        </section>
      </div>
    );
  if (state._tag === 'Finding')
    return (
      <div {...root} className="h-full min-h-0">
        <Opening root={null} />
      </div>
    );

  const project = model.projects?.find((one) => one.id === state.project);
  const projectFolder = rootOf(state) ?? '';
  // A Package entered, or a Single Package, says so itself.
  const rereading =
    state._tag === 'Monorepo' &&
    model.package === null &&
    isRereading(model, state);
  const changes = changesOf(model, state);
  // What changed in each Package, for the Package menu.
  const shown = shownChangesOf(model, state);
  const packageChanges =
    state._tag !== 'Monorepo' || shown === null
      ? null
      : changesByPackage(state.workspace.packages, shown);

  const packages: WherePanelProps['packages'] =
    state._tag === 'Monorepo'
      ? {
          all: state.workspace.packages,
          current: model.package,
          changes:
            packageChanges === null
              ? null
              : { of: packageChanges, unchanged: model.unchanged },
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
    branch: branchOf(model),
    base: baseOf(model),
    changes: model.changes,
    reading: model.changes && changes === null,
    changesProblem: model.changesProblem,
    onBranch: (branch) => send({ _tag: 'BranchChosen', branch }),
    onBase: (base) => send({ _tag: 'BaseChosen', base }),
    onChanges: () => send({ _tag: 'ChangesToggled' }),
    deleted: model.deleted,
    onDeleted: () => send({ _tag: 'DeletedToggled' }),
    unchanged: model.unchanged,
    onUnchanged: (unchanged) => send({ _tag: 'UnchangedChosen', unchanged }),
    ignored: model.ignored,
    onIgnored: () => send({ _tag: 'IgnoredToggled' }),
  };

  return (
    <div {...root} className="flex h-full min-h-0 flex-col">
      {wide ? null : (
        <header className="flex min-h-11 shrink-0 items-center gap-3 border-b border-border/60 py-1 pr-2 pl-2 max-sm:pl-1.5">
          <Breadcrumb
            project={project?.name ?? nameOf(projectFolder)}
            path={projectFolder}
            packages={packages}
            onSwitch={() => send({ _tag: 'SwitchAsked' })}
          />
          {/* Phones: one settings button at the end of the line. */}
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
                project={project?.name ?? nameOf(projectFolder)}
                path={projectFolder}
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
              <Opening root={state.root} />
            ) : state._tag === 'Failure' ? (
              <CannotOpen
                root={state.root}
                problem={state.problem}
                missing={state.missing}
                onRetry={() => send({ _tag: 'Retried' })}
                onPickAnother={() => send({ _tag: 'SwitchAsked' })}
              />
            ) : state._tag === 'Monorepo' ? (
              monorepo
            ) : state._tag === 'Package' ? (
              single
            ) : null}
          </PanelSlotsContext.Provider>
          {rereading ? <Rereading>Reading the branch…</Rereading> : null}
        </main>
      </div>
      {/* The open file or folder: a dialog centred over the tree; on a
            phone, the whole screen. */}
      <Dialog
        open={file !== null || folder !== null}
        onOpenChange={(open) => {
          if (open) return;
          send({
            _tag: folder === null ? 'FileClosed' : 'FolderClosed',
          });
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(56rem,86vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(72rem,calc(100%-4rem))] max-sm:inset-0 max-sm:h-dvh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0"
        >
          <DialogTitle className="sr-only">
            {folder === null ? 'File' : 'Folder'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {folder === null
              ? 'The file, or what changed in it.'
              : 'The files in the folder, or what changed in it, and one of them.'}
          </DialogDescription>
          {folder ?? file}
        </DialogContent>
      </Dialog>
      <Dialog
        open={picker !== null}
        onOpenChange={(open) => {
          if (!open) send({ _tag: 'Dismissed' });
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="top-[14vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Open a project</DialogTitle>
          <DialogDescription className="sr-only">
            Pick a saved project, or open a folder.
          </DialogDescription>
          {picker}
        </DialogContent>
      </Dialog>
    </div>
  );
}
