import type { ReactNode } from 'react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';

import type { MonoverseShape } from '../logic/shared/index.js';
import { Opening } from './shared/index.js';

/*
 * Monoverse drawn: with no project, the picker alone in the middle of the
 * page. With one, the project, the picker opening over it from the
 * project's crumb.
 */

type BodyProps = ViewPropsOf<typeof MonoverseShape> & {
  /** The picker, while it is open: the page, or a dialog over the project. */
  readonly picker: ReactNode;
  /** The project open, in its State. */
  readonly project: ReactNode;
};

export function Body({ root, model, state, send, picker, project }: BodyProps) {
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
              tree, and shows what breaks its monoverse.json rules.
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
  return (
    <div {...root} className="h-full min-h-0">
      {project}
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
