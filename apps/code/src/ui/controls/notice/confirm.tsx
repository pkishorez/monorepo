import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kestack/web-platform/ui/components/alert-dialog';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { type ReactNode, useEffect } from 'react';
import { keys } from '../../../device/account/machines/layout/commands.ts';

/*
 * A confirmation: a question asked before something that cannot be taken
 * back, drawn on the isolated `confirm` Surface while its owner says it is
 * open and the Surface is Active. Whoever opens it does so through
 * `useOpen`, which enters the Surface in the same handler. Focus starts on
 * keeping things as they are. Base UI moves no focus as it closes:
 * leaving the Surface puts it back where it was, by every route, Escape,
 * the keep button, and its owner closing it once it is done.
 */

/** Opens a confirmation: `open` tells its owner, then the Surface is entered, in the same handler. */
export const useOpen = () => {
  const { enter } = keys.useKeyboard();
  return (open: () => void) => {
    open();
    enter('confirm');
  };
};

export function Dialog({
  open,
  title,
  description,
  problem,
  busy,
  keep,
  confirm,
  onClose,
  onConfirm,
}: {
  /** Whether its owner asks the question now. */
  readonly open: boolean;
  readonly title: ReactNode;
  readonly description: ReactNode;
  /** Why doing it failed, said in it. */
  readonly problem: string | null;
  /** Doing it: neither button works meanwhile. */
  readonly busy: boolean;
  /** The button that keeps things as they are, and the one that does it. */
  readonly keep: string;
  readonly confirm: string;
  /** Left without doing it. */
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <Asked
      title={title}
      description={description}
      problem={problem}
      busy={busy}
      keep={keep}
      confirm={confirm}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function Asked({
  title,
  description,
  problem,
  busy,
  keep,
  confirm,
  onClose,
  onConfirm,
}: Omit<Parameters<typeof Dialog>[0], 'open'>) {
  const { active } = keys.useSurface('confirm');
  const { leave } = keys.useKeyboard();
  const spot = keys.useFocusSpot('confirm', 'keep', { default: true });
  // Closed by its owner, as once it is done, it still leaves its Surface.
  useEffect(() => () => leave('confirm'), [leave]);
  return (
    <AlertDialog
      open={active}
      onOpenChange={(next, details) => {
        // Escape is the keyboard's: it leaves the Surface, which closes this.
        if (details.reason === 'escape-key') {
          details.cancel();
          details.allowPropagation();
        } else if (!next) leave('confirm');
      }}
    >
      <keys.Surface id="confirm" asChild onExit={onClose}>
        <AlertDialogContent finalFocus={false}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel ref={spot} disabled={busy}>
              {keep}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy && <Spinner />}
              {confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </keys.Surface>
    </AlertDialog>
  );
}
