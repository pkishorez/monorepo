import { View } from '@kestack/kabuki/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';

import {
  MonoverseLive,
  baseOf,
  branchOf,
  changesOf,
  isRereading,
  rootOf,
} from './actor.js';
import { FileViewerView } from './file-viewer/index.js';
import { FolderViewerView } from './folder-viewer/index.js';
import { GitControls } from './git-controls/index.js';
import { nameOf } from './model/index.js';
import { MonorepoView } from './monorepo/index.js';
import { PackageView } from './package/index.js';
import { ProjectPickerView } from './picker/index.js';
import { Breadcrumb, CannotOpen, Opening, Rereading } from './ui/index.js';

/*
 * Monoverse drawn: with no project, the picker alone in the middle of the
 * page. With one, a slim bar, where you are on the left and the three git
 * controls on the right, over a canvas as big as it can be, the open file
 * beside it; the picker opens over it from the project's crumb.
 */

export const MonoverseView = View.make(
  MonoverseLive,
  ({ root, model, state, children, send }) => {
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
              {children.picker === undefined ? null : (
                <ProjectPickerView instance={children.picker} />
              )}
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
    const folder = rootOf(state) ?? '';
    const workspace =
      state._tag === 'Monorepo' || state._tag === 'Package'
        ? state.workspace
        : null;
    const inside =
      state._tag === 'Monorepo' && model.package !== null
        ? (workspace?.packages.find((one) => one.path === model.package)
            ?.name ?? nameOf(model.package))
        : null;
    // A Package entered, or a Single Package, says so itself.
    const rereading =
      state._tag === 'Monorepo' &&
      model.package === null &&
      isRereading(model, state);
    const changes = changesOf(model, state);

    return (
      <div {...root} className="flex h-full min-h-0 flex-col">
        <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 py-1.5 pr-2 pl-3 sm:py-0">
          <Breadcrumb
            project={project?.name ?? nameOf(folder)}
            path={folder}
            inside={inside}
            onProject={() =>
              send(inside === null ? { _tag: 'Switching' } : { _tag: 'Left' })
            }
            onSwitch={() => send({ _tag: 'Switching' })}
          />
          {/* Phones: one settings button beside the name. */}
          <div className="ml-auto">
            <GitControls
              branches={model.branches}
              problem={model.gitProblem}
              branch={branchOf(model)}
              base={baseOf(model)}
              changes={model.changes}
              reading={model.changes && changes === null}
              changesProblem={model.changesProblem}
              onBranch={(branch) => send({ _tag: 'BranchChosen', branch })}
              onBase={(base) => send({ _tag: 'BaseChosen', base })}
              onChanges={() => send({ _tag: 'ChangesToggled' })}
              deleted={model.deleted}
              onDeleted={() => send({ _tag: 'DeletedToggled' })}
              unchanged={model.unchanged}
              onUnchanged={(unchanged) =>
                send({ _tag: 'UnchangedChosen', unchanged })
              }
            />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <main className="relative min-h-0 min-w-0 flex-1">
            {state._tag === 'Opening' ? (
              <Opening root={state.root} />
            ) : state._tag === 'Failed' ? (
              <CannotOpen
                root={state.root}
                problem={state.problem}
                missing={state.missing}
                onRetry={() => send({ _tag: 'Retried' })}
                onPickAnother={() => send({ _tag: 'Switching' })}
              />
            ) : state._tag === 'Monorepo' && 'monorepo' in children ? (
              <MonorepoView instance={children.monorepo} />
            ) : state._tag === 'Package' && 'package' in children ? (
              <PackageView instance={children.package} />
            ) : null}
            {rereading ? <Rereading>Reading the branch…</Rereading> : null}
          </main>
        </div>
        {/* The open file or folder: a dialog centred over the tree; on a
            phone, the whole screen. */}
        <Dialog
          open={children.file !== undefined || children.folder !== undefined}
          onOpenChange={(open) => {
            if (open) return;
            send({
              _tag:
                children.folder === undefined ? 'FileClosed' : 'FolderClosed',
            });
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="flex h-[min(56rem,86vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(72rem,calc(100%-4rem))] max-sm:inset-0 max-sm:h-dvh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0"
          >
            <DialogTitle className="sr-only">
              {children.folder === undefined ? 'File' : 'Folder'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {children.folder === undefined
                ? 'The file, or what changed in it.'
                : 'The files in the folder, or what changed in it, and one of them.'}
            </DialogDescription>
            {children.folder !== undefined ? (
              <FolderViewerView instance={children.folder} />
            ) : children.file !== undefined ? (
              <FileViewerView instance={children.file} />
            ) : null}
          </DialogContent>
        </Dialog>
        <Dialog
          open={children.picker !== undefined}
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
            {children.picker === undefined ? null : (
              <ProjectPickerView instance={children.picker} />
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  },
);
